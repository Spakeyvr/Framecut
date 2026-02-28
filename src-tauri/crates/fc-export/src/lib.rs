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

fn default_hw_accel() -> String {
    "cpu".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextOverlayRef {
    pub content: String,
    pub font_family: String,
    pub font_size: f64,
    pub color: String,
    pub x: f64,
    pub y: f64,
    pub output_start: f64,
    pub output_end: f64,
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
    #[serde(default = "default_hw_accel")]
    pub hw_accel: String,
    #[serde(default)]
    pub text_overlays: Vec<TextOverlayRef>,
}

/// Map a hardware encoder name back to its logical codec for format validation.
fn logical_codec(encoder: &str) -> &str {
    match encoder {
        "h264_nvenc" | "h264_qsv" | "h264_amf" => "libx264",
        "hevc_nvenc" | "hevc_qsv" | "hevc_amf" => "libx265",
        "av1_nvenc" => "libaom-av1",
        other => other,
    }
}

fn validate_codec_format(encoder: &str, format: &str) -> Result<(), String> {
    let codec = logical_codec(encoder);
    let valid = match format {
        "mp4" => matches!(codec, "libx264" | "libx265"),
        "webm" => matches!(codec, "libvpx-vp9" | "libaom-av1"),
        "mkv" => matches!(codec, "libx264" | "libx265" | "libvpx-vp9" | "libaom-av1"),
        _ => false,
    };
    if !valid {
        return Err(format!("Codec '{}' is not compatible with format '{}'", encoder, format));
    }
    Ok(())
}

/// Given a logical codec and hw_accel vendor, return the actual FFmpeg encoder name.
/// Falls back to the software codec if no hardware mapping exists.
fn resolve_encoder(codec: &str, hw_accel: &str) -> String {
    if hw_accel == "cpu" {
        return codec.to_string();
    }
    match (hw_accel, codec) {
        ("nvenc", "libx264") => "h264_nvenc".to_string(),
        ("nvenc", "libx265") => "hevc_nvenc".to_string(),
        ("nvenc", "libaom-av1") => "av1_nvenc".to_string(),
        ("qsv", "libx264") => "h264_qsv".to_string(),
        ("qsv", "libx265") => "hevc_qsv".to_string(),
        ("amf", "libx264") => "h264_amf".to_string(),
        ("amf", "libx265") => "hevc_amf".to_string(),
        // No hardware encoder for this codec — silent fallback to CPU
        _ => codec.to_string(),
    }
}

/// Append encoder-specific quality/rate-control flags to the FFmpeg args.
fn append_quality_args(args: &mut Vec<String>, encoder: &str, crf: u32) {
    match encoder {
        "h264_nvenc" | "hevc_nvenc" | "av1_nvenc" => {
            args.extend([
                "-rc".to_string(),
                "vbr".to_string(),
                "-cq".to_string(),
                crf.to_string(),
                "-preset".to_string(),
                "p5".to_string(),
                "-tune".to_string(),
                "hq".to_string(),
                "-multipass".to_string(),
                "fullres".to_string(),
            ]);
        }
        "h264_qsv" | "hevc_qsv" => {
            args.extend([
                "-global_quality".to_string(),
                crf.to_string(),
                "-preset".to_string(),
                "medium".to_string(),
                "-look_ahead".to_string(),
                "1".to_string(),
            ]);
        }
        "h264_amf" | "hevc_amf" => {
            args.extend([
                "-rc".to_string(),
                "cqp".to_string(),
                "-qp_i".to_string(),
                crf.to_string(),
                "-qp_p".to_string(),
                (crf + 2).to_string(),
                "-quality".to_string(),
                "quality".to_string(),
            ]);
        }
        "libx264" | "libx265" => {
            args.extend([
                "-crf".to_string(),
                crf.to_string(),
                "-preset".to_string(),
                "medium".to_string(),
            ]);
        }
        "libvpx-vp9" => {
            args.extend([
                "-crf".to_string(),
                crf.to_string(),
                "-b:v".to_string(),
                "0".to_string(),
                "-speed".to_string(),
                "2".to_string(),
            ]);
        }
        "libaom-av1" => {
            args.extend([
                "-crf".to_string(),
                crf.to_string(),
                "-b:v".to_string(),
                "0".to_string(),
                "-cpu-used".to_string(),
                "4".to_string(),
            ]);
        }
        _ => {
            args.extend(["-crf".to_string(), crf.to_string()]);
        }
    }
}

/// Run `ffmpeg -encoders` and return the names of available hardware encoders.
pub fn detect_hw_encoders() -> Result<Vec<String>, String> {
    let output = fc_ffmpeg::ffmpeg_command()
        .args(["-encoders", "-hide_banner"])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    if !output.status.success() {
        return Err("ffmpeg -encoders failed".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let hw_encoder_names =
        ["h264_nvenc", "hevc_nvenc", "av1_nvenc", "h264_qsv", "hevc_qsv", "h264_amf", "hevc_amf"];

    let mut found = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        for &name in &hw_encoder_names {
            if trimmed.contains(name) && !found.contains(&name.to_string()) {
                found.push(name.to_string());
            }
        }
    }

    Ok(found)
}

/// Escape text for FFmpeg's drawtext filter.
/// FFmpeg drawtext requires escaping: \, ', :, ;, [, ], and %
fn escape_drawtext(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\\\\\"),
            '\'' => out.push_str("'\\\\\\''"),
            ':' => out.push_str("\\\\:"),
            ';' => out.push_str("\\\\;"),
            '[' => out.push_str("\\\\["),
            ']' => out.push_str("\\\\]"),
            '%' => out.push_str("%%%%"),
            _ => out.push(ch),
        }
    }
    out
}

/// Convert a CSS hex color (#rrggbb or #rgb) to FFmpeg's 0xRRGGBB format.
fn css_color_to_ffmpeg(color: &str) -> String {
    let hex = color.trim_start_matches('#');
    let expanded = if hex.len() == 3 {
        // Expand #RGB to #RRGGBB
        let chars: Vec<char> = hex.chars().collect();
        format!("{}{}{}{}{}{}", chars[0], chars[0], chars[1], chars[1], chars[2], chars[2])
    } else {
        hex.to_string()
    };
    format!("0x{expanded}")
}

/// Build chained drawtext filter expressions for text overlays.
/// Returns (filter_string, final_label) or None if no overlays.
fn build_drawtext_filters(
    overlays: &[TextOverlayRef],
    export_height: u32,
    start_label: &str,
) -> Option<(String, String)> {
    if overlays.is_empty() {
        return None;
    }

    let mut filter = String::new();
    let mut prev_label = start_label.to_string();

    for (i, overlay) in overlays.iter().enumerate() {
        let label = format!("dtxt{i}");

        // Scale font size from 1080p reference to export resolution
        let scaled_size = (overlay.font_size / 1080.0) * f64::from(export_height);
        let font_size = scaled_size.round().max(1.0) as u32;

        // Shadow offset: ~4% of font size, minimum 1px
        let shadow_offset = ((scaled_size * 0.04).round() as u32).max(1);

        let color = css_color_to_ffmpeg(&overlay.color);
        let text = escape_drawtext(&overlay.content);
        let font = escape_drawtext(&overlay.font_family);

        // Position: convert normalized 0–1 coords to FFmpeg expressions
        // x=0.5 means center, so: x = (w * nx) - text_w/2
        // y=0.5 means center, so: y = (h * ny) - text_h/2
        let x_expr = format!("(w*{:.4}-text_w/2)", overlay.x);
        let y_expr = format!("(h*{:.4}-text_h/2)", overlay.y);

        filter.push_str(&format!(
            "[{prev_label}]drawtext=font='{font}':fontsize={font_size}:\
             fontcolor={color}:x={x_expr}:y={y_expr}:\
             shadowcolor=black@0.6:shadowx={shadow_offset}:shadowy={shadow_offset}:\
             text='{text}':enable='between(t,{:.3},{:.3})'[{label}]",
            overlay.output_start, overlay.output_end,
        ));

        if i < overlays.len() - 1 {
            filter.push(';');
        }

        prev_label = label;
    }

    let final_label = format!("dtxt{}", overlays.len() - 1);
    Some((filter, final_label))
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
        return Err("Output path matches an input media file. Choose a different output filename."
            .to_string());
    }

    // Build a concat-style filter complex
    // For each clip: input with -ss and -t, then scale+pad to output resolution
    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-nostats".to_string(),
        "-progress".to_string(),
        "pipe:2".to_string(),
    ];
    let mut filter_inputs = String::new();

    for (i, clip) in sorted_clips.iter().enumerate() {
        let duration = clip.source_end - clip.source_start;
        if duration <= 0.0 {
            return Err(format!("Clip {} has non-positive duration", i + 1));
        }
        if is_image_path(&clip.media_path) {
            args.extend([
                "-loop".to_string(),
                "1".to_string(),
                "-framerate".to_string(),
                format!("{:.3}", request.fps),
                "-t".to_string(),
                format!("{:.3}", duration),
                "-i".to_string(),
                clip.media_path.clone(),
            ]);
        } else {
            args.extend([
                "-ss".to_string(),
                format!("{:.3}", clip.source_start),
                "-t".to_string(),
                format!("{:.3}", duration),
                "-i".to_string(),
                clip.media_path.clone(),
            ]);
        }

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
    let mut full_filter = if include_audio {
        let mut audio_inputs = String::new();
        for i in 0..sorted_clips.len() {
            audio_inputs.push_str(&format!("[{i}:a]"));
        }
        format!("{filter_complex};{audio_inputs}concat=n={}:v=0:a=1[outa]", sorted_clips.len())
    } else {
        filter_complex
    };

    // Chain drawtext filters for text overlays after concat
    let video_out_label = if let Some((dt_filter, final_label)) =
        build_drawtext_filters(&request.text_overlays, request.height, "outv")
    {
        full_filter.push(';');
        full_filter.push_str(&dt_filter);
        format!("[{final_label}]")
    } else {
        "[outv]".to_string()
    };

    args.extend(["-filter_complex".to_string(), full_filter]);

    args.extend(["-map".to_string(), video_out_label]);
    if include_audio {
        args.extend(["-map".to_string(), "[outa]".to_string()]);
    }

    // Resolve the actual FFmpeg encoder (may be hw-accelerated or software fallback)
    let encoder = resolve_encoder(&request.codec, &request.hw_accel);

    // Validate encoder-format compatibility
    validate_codec_format(&encoder, &request.format)?;

    args.extend(["-c:v".to_string(), encoder.clone()]);

    // Apply encoder-specific quality/rate-control flags
    append_quality_args(&mut args, &encoder, request.crf);

    args.extend(["-r".to_string(), format!("{}", request.fps)]);

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

                        // Parse ffmpeg progress from either -progress output or status lines.
                        let progress_secs = if let Some(value) = text.strip_prefix("out_time_ms=")
                        {
                            value
                                .trim()
                                .parse::<f64>()
                                .ok()
                                .map(|microseconds| microseconds / 1_000_000.0)
                        } else if let Some(value) = text.strip_prefix("out_time=") {
                            parse_ffmpeg_time(value.trim())
                        } else if let Some(pos) = text.find("time=") {
                            let time_str = &text[pos + 5..];
                            let token = time_str.split_whitespace().next().unwrap_or(time_str);
                            parse_ffmpeg_time(token.trim())
                        } else {
                            None
                        };

                        if let Some(secs) = progress_secs {
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
        return Err(format!("FFmpeg exited with code: {code}\n{stderr_excerpt}"));
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

fn is_image_path(path: &str) -> bool {
    let ext = Path::new(path).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase());

    matches!(
        ext.as_deref(),
        Some("png")
            | Some("jpg")
            | Some("jpeg")
            | Some("bmp")
            | Some("gif")
            | Some("webp")
            | Some("tif")
            | Some("tiff")
    )
}

fn paths_refer_to_same_file(a: &str, b: &str) -> bool {
    let path_a = Path::new(a);
    let path_b = Path::new(b);

    if let (Ok(canon_a), Ok(canon_b)) =
        (std::fs::canonicalize(path_a), std::fs::canonicalize(path_b))
    {
        return canon_a == canon_b;
    }

    normalize_path_for_compare(path_a) == normalize_path_for_compare(path_b)
}

fn normalize_path_for_compare(path: &Path) -> String {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join(path)
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

    #[test]
    fn test_escape_drawtext_plain() {
        assert_eq!(escape_drawtext("Hello World"), "Hello World");
    }

    #[test]
    fn test_escape_drawtext_special_chars() {
        assert_eq!(escape_drawtext("it's"), "it'\\\\\\''s");
        assert_eq!(escape_drawtext("a:b"), "a\\\\:b");
        assert_eq!(escape_drawtext("100%"), "100%%%%");
        assert_eq!(escape_drawtext("[tag]"), "\\\\[tag\\\\]");
        assert_eq!(escape_drawtext("a;b"), "a\\\\;b");
    }

    #[test]
    fn test_css_color_to_ffmpeg() {
        assert_eq!(css_color_to_ffmpeg("#ffffff"), "0xffffff");
        assert_eq!(css_color_to_ffmpeg("#ff0000"), "0xff0000");
        assert_eq!(css_color_to_ffmpeg("#abc"), "0xaabbcc");
    }

    #[test]
    fn test_build_drawtext_filters_empty() {
        assert!(build_drawtext_filters(&[], 1080, "outv").is_none());
    }

    #[test]
    fn test_build_drawtext_filters_single() {
        let overlays = vec![TextOverlayRef {
            content: "Hello".to_string(),
            font_family: "Arial".to_string(),
            font_size: 48.0,
            color: "#ffffff".to_string(),
            x: 0.5,
            y: 0.5,
            output_start: 2.0,
            output_end: 5.0,
        }];
        let (filter, label) = build_drawtext_filters(&overlays, 1080, "outv").unwrap();
        assert_eq!(label, "dtxt0");
        assert!(filter.contains("drawtext="));
        assert!(filter.contains("font='Arial'"));
        assert!(filter.contains("fontsize=48"));
        assert!(filter.contains("fontcolor=0xffffff"));
        assert!(filter.contains("text='Hello'"));
        assert!(filter.contains("enable='between(t,2.000,5.000)'"));
        assert!(filter.contains("[outv]"));
        assert!(filter.contains("[dtxt0]"));
    }

    #[test]
    fn test_build_drawtext_filters_multiple() {
        let overlays = vec![
            TextOverlayRef {
                content: "First".to_string(),
                font_family: "Arial".to_string(),
                font_size: 48.0,
                color: "#ffffff".to_string(),
                x: 0.5,
                y: 0.3,
                output_start: 0.0,
                output_end: 3.0,
            },
            TextOverlayRef {
                content: "Second".to_string(),
                font_family: "Impact".to_string(),
                font_size: 64.0,
                color: "#ff0000".to_string(),
                x: 0.5,
                y: 0.7,
                output_start: 2.0,
                output_end: 6.0,
            },
        ];
        let (filter, label) = build_drawtext_filters(&overlays, 1080, "outv").unwrap();
        assert_eq!(label, "dtxt1");
        // Should chain: [outv]drawtext=...[dtxt0];[dtxt0]drawtext=...[dtxt1]
        assert!(filter.contains("[outv]drawtext="));
        assert!(filter.contains("[dtxt0];[dtxt0]drawtext="));
        assert!(filter.contains("[dtxt1]"));
    }

    #[test]
    fn test_build_drawtext_filters_scaled_resolution() {
        let overlays = vec![TextOverlayRef {
            content: "Hi".to_string(),
            font_family: "Arial".to_string(),
            font_size: 48.0,
            color: "#ffffff".to_string(),
            x: 0.5,
            y: 0.5,
            output_start: 0.0,
            output_end: 1.0,
        }];
        // At 720p, font_size 48 should scale to 48/1080*720 = 32
        let (filter, _) = build_drawtext_filters(&overlays, 720, "outv").unwrap();
        assert!(filter.contains("fontsize=32"));
    }

    #[test]
    fn test_text_overlays_deserialization_default() {
        let json = r#"{
            "clips": [],
            "output_path": "out.mp4",
            "width": 1920, "height": 1080,
            "fps": 30.0, "codec": "libx264",
            "crf": 20, "audio_bitrate": "192k"
        }"#;
        let req: ExportRequest = serde_json::from_str(json).unwrap();
        assert!(req.text_overlays.is_empty());
    }
}
