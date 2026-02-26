use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipRef {
    pub media_path: String,
    pub source_start: f64,
    pub source_end: f64,
    pub timeline_start: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRequest {
    pub clips: Vec<ClipRef>,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub crf: u32,
    pub audio_bitrate: String,
}

/// Build an FFmpeg concat file and command for the export.
/// For MVP, we use the concat demuxer with trimmed inputs.
fn build_ffmpeg_args(
    clips: &[ClipRef],
    request: &ExportRequest,
    _concat_file_path: &str,
) -> Result<(Vec<String>, String), String> {
    if clips.is_empty() {
        return Err("No clips to export".to_string());
    }

    // Sort clips by timeline start
    let mut sorted_clips = clips.to_vec();
    sorted_clips.sort_by(|a, b| a.timeline_start.partial_cmp(&b.timeline_start).unwrap());

    // Build a concat-style filter complex
    // For each clip: input with -ss and -t, then scale+pad to output resolution
    let mut args: Vec<String> = vec!["-y".to_string()];
    let mut filter_inputs = String::new();

    for (i, clip) in sorted_clips.iter().enumerate() {
        let duration = clip.source_end - clip.source_start;
        args.extend([
            "-ss".to_string(),
            format!("{:.3}", clip.source_start),
            "-t".to_string(),
            format!("{:.3}", duration),
            "-i".to_string(),
            clip.media_path.clone(),
        ]);

        // Build filter for this input: scale and pad to target resolution
        filter_inputs.push_str(&format!(
            "[{i}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v{i}];",
            w = request.width,
            h = request.height,
        ));
    }

    // Concatenate all scaled video streams
    let mut concat_input = String::new();
    for i in 0..sorted_clips.len() {
        concat_input.push_str(&format!("[v{i}]"));
    }
    let filter_complex =
        format!("{filter_inputs}{concat_input}concat=n={}:v=1:a=0[outv]", sorted_clips.len());

    // Handle audio: try to concat audio streams too
    let mut has_audio_filter = String::new();
    let mut audio_count = 0;
    // For simplicity in MVP, concatenate audio from all inputs
    for i in 0..sorted_clips.len() {
        has_audio_filter.push_str(&format!("[{i}:a?]"));
        audio_count += 1;
    }
    let full_filter = if audio_count > 0 {
        format!("{filter_complex};{has_audio_filter}concat=n={audio_count}:v=0:a=1[outa]")
    } else {
        filter_complex
    };

    args.extend(["-filter_complex".to_string(), full_filter]);

    args.extend(["-map".to_string(), "[outv]".to_string()]);
    if audio_count > 0 {
        args.extend(["-map".to_string(), "[outa]".to_string()]);
    }

    args.extend([
        "-c:v".to_string(),
        request.codec.clone(),
        "-preset".to_string(),
        "medium".to_string(),
        "-crf".to_string(),
        request.crf.to_string(),
        "-r".to_string(),
        format!("{}", request.fps),
    ]);

    if audio_count > 0 {
        args.extend([
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            request.audio_bitrate.clone(),
        ]);
    }

    args.extend(["-movflags".to_string(), "+faststart".to_string()]);
    args.push(request.output_path.clone());

    Ok((args, String::new()))
}

/// Run the export, emitting progress events. Can be cancelled via the watch channel.
pub async fn run_export(
    clips: &[ClipRef],
    request: &ExportRequest,
    job_id: &str,
    app: &AppHandle,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
) -> Result<(), String> {
    let (args, _) = build_ffmpeg_args(clips, request, "")?;

    // Calculate total duration for progress tracking
    let total_duration: f64 = clips.iter().map(|c| c.source_end - c.source_start).sum();

    let mut child = tokio::process::Command::new("ffmpeg")
        .args(&args)
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {e}"))?;

    let stderr = child.stderr.take().ok_or("No stderr")?;
    let reader = tokio::io::BufReader::new(stderr);
    let mut lines = reader.lines();

    let job_id_owned = job_id.to_string();

    loop {
        tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    child.kill().await.ok();
                    return Err("Export cancelled".to_string());
                }
            }
            line = lines.next_line() => {
                match line {
                    Ok(Some(text)) => {
                        // Parse ffmpeg progress: look for "time=HH:MM:SS.ms"
                        if let Some(pos) = text.find("time=") {
                            let time_str = &text[pos + 5..];
                            if let Some(end) = time_str.find(' ') {
                                let time_val = &time_str[..end];
                                if let Some(secs) = parse_ffmpeg_time(time_val) {
                                    let progress = if total_duration > 0.0 {
                                        (secs / total_duration).min(1.0)
                                    } else {
                                        0.0
                                    };
                                    let _ = app.emit(
                                        "export-progress",
                                        serde_json::json!({
                                            "jobId": job_id_owned,
                                            "progress": progress
                                        }),
                                    );
                                }
                            }
                        }
                    }
                    Ok(None) => break, // EOF
                    Err(_) => break,
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| format!("Failed to wait for ffmpeg: {e}"))?;

    if !status.success() {
        return Err(format!("FFmpeg exited with code: {}", status));
    }

    Ok(())
}

fn parse_ffmpeg_time(s: &str) -> Option<f64> {
    // Format: HH:MM:SS.ms or -HH:MM:SS.ms
    let s = s.trim_start_matches('-');
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().ok()?;
        let m: f64 = parts[1].parse().ok()?;
        let s: f64 = parts[2].parse().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        s.parse().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ffmpeg_time() {
        assert!((parse_ffmpeg_time("00:01:30.50").unwrap() - 90.5).abs() < 0.01);
        assert!((parse_ffmpeg_time("00:00:05.00").unwrap() - 5.0).abs() < 0.01);
    }
}
