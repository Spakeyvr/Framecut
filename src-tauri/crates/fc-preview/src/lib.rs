use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipRef {
    pub media_path: String,
    pub source_start: f64,
    pub source_end: f64,
    pub timeline_start: f64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct DecodeMetrics {
    pub spawn_ms: f64,
    pub total_ms: f64,
}

impl DecodeMetrics {
    pub fn decode_ms(self) -> f64 {
        (self.total_ms - self.spawn_ms).max(0.0)
    }
}

#[derive(Debug, Clone)]
pub struct PreviewDecodeResult {
    pub frame: Vec<u8>,
    pub metrics: DecodeMetrics,
}

/// Decode a single frame from a media file at the given time.
/// Returns frame bytes encoded by ffmpeg (MJPEG).
pub fn decode_frame(path: &str, time: f64, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let decoded = decode_frame_with_metrics(path, time, width, height)?;
    Ok(decoded.frame)
}

fn decode_frame_with_metrics(
    path: &str,
    time: f64,
    width: u32,
    height: u32,
) -> Result<PreviewDecodeResult, String> {
    let started_at = Instant::now();
    let child = fc_ffmpeg::ffmpeg_command()
        .args([
            "-hwaccel",
            "auto",
            "-ss",
            &format!("{time:.3}"),
            "-i",
            path,
            "-an",
            "-sn",
            "-dn",
            "-vframes",
            "1",
            "-vf",
            &format!(
                "scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"
            ),
            "-f",
            "image2pipe",
            "-c:v",
            "mjpeg",
            "-q:v",
            "3",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg for frame decode: {e}"))?;

    let spawn_ms = started_at.elapsed().as_secs_f64() * 1000.0;
    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for ffmpeg frame decode: {e}"))?;
    let total_ms = started_at.elapsed().as_secs_f64() * 1000.0;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg frame decode failed: {stderr}"));
    }

    Ok(PreviewDecodeResult {
        frame: output.stdout,
        metrics: DecodeMetrics { spawn_ms, total_ms },
    })
}

/// Given a set of timeline clips and a time, find which clip is active and decode
/// the correct frame from the source media.
pub fn decode_frame_for_timeline(
    clips: &[ClipRef],
    time: f64,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    let decoded = decode_frame_for_timeline_with_metrics(clips, time, width, height)?;
    Ok(decoded.frame)
}

/// Same as `decode_frame_for_timeline`, but includes decode timing metrics.
pub fn decode_frame_for_timeline_with_metrics(
    clips: &[ClipRef],
    time: f64,
    width: u32,
    height: u32,
) -> Result<PreviewDecodeResult, String> {
    // Find the topmost clip that covers this time
    // (clips are assumed to be ordered by track priority, topmost first)
    for clip in clips {
        let clip_end = clip.timeline_start + (clip.source_end - clip.source_start);
        if time >= clip.timeline_start && time < clip_end {
            let source_time = clip.source_start + (time - clip.timeline_start);
            return decode_frame_with_metrics(&clip.media_path, source_time, width, height);
        }
    }

    // No clip at this time; return black frame.
    Ok(PreviewDecodeResult {
        frame: vec![0u8; (width * height * 4) as usize],
        metrics: DecodeMetrics::default(),
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn placeholder() {
        assert!(true);
    }
}
