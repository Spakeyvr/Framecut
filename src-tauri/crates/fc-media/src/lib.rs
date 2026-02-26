use serde::{Deserialize, Serialize};
use std::process::Command;

/// Metadata returned by probing a media file with FFprobe.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub has_audio: bool,
    pub codec: String,
    pub media_type: String, // "video", "audio", "image"
}

/// Check whether FFmpeg/FFprobe are available on PATH.
pub fn check_ffmpeg() -> Result<(), String> {
    Command::new("ffprobe").arg("-version").output().map_err(|_| {
        "FFprobe not found on PATH. Please install FFmpeg: https://ffmpeg.org".to_string()
    })?;
    Command::new("ffmpeg").arg("-version").output().map_err(|_| {
        "FFmpeg not found on PATH. Please install FFmpeg: https://ffmpeg.org".to_string()
    })?;
    Ok(())
}

/// Probe a media file and return its metadata.
pub fn probe(path: &str) -> Result<MediaInfo, String> {
    let output = Command::new("ffprobe")
        .args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe JSON: {e}"))?;

    // Extract streams
    let streams = json["streams"].as_array().ok_or("No streams found")?;
    let format = &json["format"];

    let mut width = 0u32;
    let mut height = 0u32;
    let mut fps = 0.0f64;
    let mut has_video = false;
    let mut has_audio = false;
    let mut codec = String::new();

    for stream in streams {
        let codec_type = stream["codec_type"].as_str().unwrap_or("");
        if codec_type == "video" && !has_video {
            has_video = true;
            width = stream["width"].as_u64().unwrap_or(0) as u32;
            height = stream["height"].as_u64().unwrap_or(0) as u32;
            codec = stream["codec_name"].as_str().unwrap_or("unknown").to_string();

            // Parse fps from r_frame_rate (e.g. "30/1" or "30000/1001")
            if let Some(rate) = stream["r_frame_rate"].as_str() {
                fps = parse_fraction(rate);
            }
        }
        if codec_type == "audio" {
            has_audio = true;
            if !has_video {
                codec = stream["codec_name"].as_str().unwrap_or("unknown").to_string();
            }
        }
    }

    // Duration from format
    let duration = format["duration"].as_str().and_then(|d| d.parse::<f64>().ok()).unwrap_or(0.0);

    let media_type = if has_video {
        // Check for image formats (single frame)
        if duration < 0.1 && fps < 1.0 {
            "image"
        } else {
            "video"
        }
    } else if has_audio {
        "audio"
    } else {
        "video" // fallback
    };

    Ok(MediaInfo {
        duration,
        width,
        height,
        fps: if fps > 0.0 { fps } else { 30.0 },
        has_audio,
        codec,
        media_type: media_type.to_string(),
    })
}

/// Generate a single thumbnail image from a media file.
pub fn generate_thumbnail(path: &str, time: f64, out_path: &str, width: u32) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-ss",
            &format!("{time:.3}"),
            "-i",
            path,
            "-vframes",
            "1",
            "-vf",
            &format!("scale={width}:-1"),
            out_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(format!("ffmpeg thumbnail failed: {stderr}"));
    }
    Ok(())
}

/// Generate a horizontal strip of thumbnails for timeline display.
/// Each thumbnail is `thumb_width` px wide, taken at `interval` second gaps.
pub fn generate_thumbnail_strip(
    path: &str,
    duration: f64,
    out_path: &str,
    interval: f64,
    thumb_width: u32,
) -> Result<(), String> {
    let n_frames = ((duration / interval).ceil() as u32).max(1);
    let fps_filter = format!("fps=1/{interval:.3}");
    let scale_filter = format!("scale={thumb_width}:-1");
    let tile_filter = format!("tile={n_frames}x1");

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            path,
            "-vf",
            &format!("{fps_filter},{scale_filter},{tile_filter}"),
            "-frames:v",
            "1",
            out_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(format!("ffmpeg thumbnail strip failed: {stderr}"));
    }
    Ok(())
}

fn parse_fraction(s: &str) -> f64 {
    if let Some((num, den)) = s.split_once('/') {
        let n: f64 = num.parse().unwrap_or(0.0);
        let d: f64 = den.parse().unwrap_or(1.0);
        if d != 0.0 {
            n / d
        } else {
            0.0
        }
    } else {
        s.parse().unwrap_or(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_fraction() {
        assert!((parse_fraction("30/1") - 30.0).abs() < 0.01);
        assert!((parse_fraction("30000/1001") - 29.97).abs() < 0.01);
        assert!((parse_fraction("24") - 24.0).abs() < 0.01);
        assert!((parse_fraction("0/0") - 0.0).abs() < 0.01);
    }
}
