use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipRef {
    pub media_path: String,
    pub source_start: f64,
    pub source_end: f64,
    pub timeline_start: f64,
    #[serde(default)]
    pub has_audio: bool,
}

fn default_format() -> String {
    "mp4".to_string()
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
    #[serde(default = "default_format")]
    pub format: String,
}

fn validate_codec_format(codec: &str, format: &str) -> Result<(), String> {
    let valid = match format {
        "mp4" => matches!(codec, "libx264" | "libx265"),
        "webm" => matches!(codec, "libvpx-vp9" | "libaom-av1"),
        "mkv" => matches!(codec, "libx264" | "libx265" | "libvpx-vp9" | "libaom-av1"),
        _ => false,
    };
    if !valid {
        return Err(format!(
            "Codec '{}' is not compatible with format '{}'",
            codec, format
        ));
    }
    Ok(())
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

    if sorted_clips
        .iter()
        .any(|clip| paths_refer_to_same_file(&clip.media_path, &request.output_path))
    {
        return Err(
            "Output path matches an input media file. Choose a different output filename."
                .to_string(),
        );
    }

    // Build a concat-style filter complex
    // For each clip: input with -ss and -t, then scale+pad to output resolution
    let mut args: Vec<String> = vec!["-y".to_string(), "-hide_banner".to_string()];
    let mut filter_inputs = String::new();

    for (i, clip) in sorted_clips.iter().enumerate() {
        let duration = clip.source_end - clip.source_start;
        if duration <= 0.0 {
            return Err(format!("Clip {} has non-positive duration", i + 1));
        }
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

    // Audio concat only when all clips report audio.
    let include_audio = sorted_clips.iter().all(|clip| clip.has_audio);
    let full_filter = if include_audio {
        let mut audio_inputs = String::new();
        for i in 0..sorted_clips.len() {
            audio_inputs.push_str(&format!("[{i}:a]"));
        }
        format!(
            "{filter_complex};{audio_inputs}concat=n={}:v=0:a=1[outa]",
            sorted_clips.len()
        )
    } else {
        filter_complex
    };

    args.extend(["-filter_complex".to_string(), full_filter]);

    args.extend(["-map".to_string(), "[outv]".to_string()]);
    if include_audio {
        args.extend(["-map".to_string(), "[outa]".to_string()]);
    }

    // Validate codec-format compatibility
    validate_codec_format(&request.codec, &request.format)?;

    args.extend(["-c:v".to_string(), request.codec.clone()]);

    // Codec-specific encoding flags
    match request.codec.as_str() {
        "libx264" | "libx265" => {
            args.extend(["-preset".to_string(), "medium".to_string()]);
        }
        "libvpx-vp9" => {
            args.extend([
                "-b:v".to_string(), "0".to_string(),
                "-speed".to_string(), "2".to_string(),
            ]);
        }
        "libaom-av1" => {
            args.extend([
                "-b:v".to_string(), "0".to_string(),
                "-cpu-used".to_string(), "4".to_string(),
            ]);
        }
        _ => {}
    }

    args.extend([
        "-crf".to_string(),
        request.crf.to_string(),
        "-r".to_string(),
        format!("{}", request.fps),
    ]);

    if include_audio {
        let audio_codec = match request.format.as_str() {
            "webm" => "libopus",
            _ => "aac",
        };
        args.extend([
            "-c:a".to_string(),
            audio_codec.to_string(),
            "-b:a".to_string(),
            request.audio_bitrate.clone(),
        ]);
    }

    // MP4-specific: move moov atom for streaming
    if request.format == "mp4" {
        args.extend(["-movflags".to_string(), "+faststart".to_string()]);
    }

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

    let mut child = fc_ffmpeg::tokio_ffmpeg_command()
        .args(&args)
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {e}"))?;

    let stderr = child.stderr.take().ok_or("No stderr")?;
    let reader = tokio::io::BufReader::new(stderr);
    let mut lines = reader.lines();
    let mut stderr_tail: VecDeque<String> = VecDeque::new();

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
                        if stderr_tail.len() == 30 {
                            stderr_tail.pop_front();
                        }
                        stderr_tail.push_back(text.clone());

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
        let code = status
            .code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "terminated by signal".to_string());
        let stderr_excerpt = stderr_tail
            .into_iter()
            .filter(|line| !line.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if stderr_excerpt.is_empty() {
            return Err(format!("FFmpeg exited with code: {code}"));
        }
        return Err(format!(
            "FFmpeg exited with code: {code}\n{stderr_excerpt}"
        ));
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

fn paths_refer_to_same_file(a: &str, b: &str) -> bool {
    let path_a = Path::new(a);
    let path_b = Path::new(b);

    if let (Ok(canon_a), Ok(canon_b)) = (std::fs::canonicalize(path_a), std::fs::canonicalize(path_b))
    {
        return canon_a == canon_b;
    }

    normalize_path_for_compare(path_a) == normalize_path_for_compare(path_b)
}

fn normalize_path_for_compare(path: &Path) -> String {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    };

    #[cfg(windows)]
    {
        let mut s = absolute.to_string_lossy().replace('/', "\\");
        while s.ends_with('\\') {
            s.pop();
        }
        s.to_ascii_lowercase()
    }

    #[cfg(not(windows))]
    {
        absolute.to_string_lossy().to_string()
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
