use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipRef {
    pub media_path: String,
    pub source_start: f64,
    pub source_end: f64,
    pub timeline_start: f64,
}

/// Decode a single frame from a media file at the given time.
/// Returns raw RGBA pixel data.
pub fn decode_frame(path: &str, time: f64, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let output = Command::new("ffmpeg")
        .args([
            "-ss",
            &format!("{time:.3}"),
            "-i",
            path,
            "-vframes",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-vf",
            &format!("scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"),
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg for frame decode: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg frame decode failed: {stderr}"));
    }

    Ok(output.stdout)
}

/// Given a set of timeline clips and a time, find which clip is active and decode
/// the correct frame from the source media.
pub fn decode_frame_for_timeline(
    clips: &[ClipRef],
    time: f64,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    // Find the topmost clip that covers this time
    // (clips are assumed to be ordered by track priority, topmost first)
    for clip in clips {
        let clip_end = clip.timeline_start + (clip.source_end - clip.source_start);
        if time >= clip.timeline_start && time < clip_end {
            let source_time = clip.source_start + (time - clip.timeline_start);
            return decode_frame(&clip.media_path, source_time, width, height);
        }
    }

    // No clip at this time — return black frame
    Ok(vec![0u8; (width * height * 4) as usize])
}

#[cfg(test)]
mod tests {
    #[test]
    fn placeholder() {
        assert!(true);
    }
}
