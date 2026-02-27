use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, Manager, State};

// ── App state ─────────────────────────────────────────────────────────────────

/// Holds the data directory path and active export jobs.
pub struct AppState {
    pub data_dir: PathBuf,
    pub export_jobs: Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>,
}

// ── Shared types for IPC ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItemResponse {
    pub id: String,
    pub name: String,
    pub path: String,
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub has_audio: bool,
    pub thumbnail_path: String,
    #[serde(rename = "type")]
    pub media_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipRef {
    pub media_path: String,
    pub source_start: f64,
    pub source_end: f64,
    pub timeline_start: f64,
    #[serde(default)]
    pub has_audio: bool,
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

// ── Project commands ──────────────────────────────────────────────────────────

#[command]
fn create_project(name: String) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    Ok(serde_json::json!({ "id": id, "name": name }).to_string())
}

#[command]
fn open_project(path: String) -> Result<String, String> {
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read project file: {e}"))?;
    Ok(contents)
}

#[command]
fn save_project(path: String, data: String) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| format!("Failed to save project: {e}"))
}

#[command]
fn undo() -> Result<(), String> {
    // Undo is handled on the frontend via Zustand snapshots
    Ok(())
}

#[command]
fn redo() -> Result<(), String> {
    // Redo is handled on the frontend via Zustand snapshots
    Ok(())
}

// ── Media commands ────────────────────────────────────────────────────────────

#[command]
async fn import_media(paths: Vec<String>, state: State<'_, AppState>) -> Result<String, String> {
    let data_dir = state.data_dir.clone();
    let thumbs_dir = data_dir.join("thumbnails");
    std::fs::create_dir_all(&thumbs_dir)
        .map_err(|e| format!("Failed to create thumbnails dir: {e}"))?;

    let mut items: Vec<MediaItemResponse> = Vec::new();

    for file_path in &paths {
        let info = fc_media::probe(file_path)?;
        let id = uuid::Uuid::new_v4().to_string();
        let name = std::path::Path::new(file_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // Generate thumbnail (best-effort, don't fail the whole import)
        let thumb_path = thumbs_dir.join(format!("{id}.jpg"));
        let thumb_str = thumb_path.to_string_lossy().to_string();
        let has_thumb = if info.media_type != "audio" {
            fc_media::generate_thumbnail(
                file_path,
                0.5_f64.min(info.duration / 2.0),
                &thumb_str,
                200,
            )
            .is_ok()
        } else {
            false
        };

        items.push(MediaItemResponse {
            id,
            name,
            path: file_path.clone(),
            duration: info.duration,
            width: info.width,
            height: info.height,
            fps: info.fps,
            has_audio: info.has_audio,
            thumbnail_path: if has_thumb { thumb_str } else { String::new() },
            media_type: info.media_type,
        });
    }

    serde_json::to_string(&items).map_err(|e| format!("Serialization error: {e}"))
}

#[command]
fn probe_media(path: String) -> Result<String, String> {
    let info = fc_media::probe(&path)?;
    serde_json::to_string(&info).map_err(|e| format!("Serialization error: {e}"))
}

#[command]
fn generate_proxy(media_id: String) -> Result<(), String> {
    let _ = &media_id;
    // Proxy generation will be added in a future phase
    Ok(())
}

#[command]
fn get_thumbnail(path: String, time: f64, state: State<'_, AppState>) -> Result<String, String> {
    let data_dir = state.data_dir.clone();
    let thumbs_dir = data_dir.join("thumbnails");
    std::fs::create_dir_all(&thumbs_dir)
        .map_err(|e| format!("Failed to create thumbnails dir: {e}"))?;
    let out_name = format!("seek_{}.jpg", uuid::Uuid::new_v4());
    let out_path = thumbs_dir.join(&out_name);
    let out_str = out_path.to_string_lossy().to_string();
    fc_media::generate_thumbnail(&path, time, &out_str, 320)?;
    Ok(out_str)
}

#[command]
fn get_waveform(media_id: String) -> Result<Vec<f32>, String> {
    let _ = &media_id;
    Ok(vec![])
}

// ── Timeline commands (logic on frontend, stubs here) ─────────────────────────

#[command]
fn add_track(kind: String) -> Result<String, String> {
    let _ = &kind;
    Ok("{}".into())
}

#[command]
fn remove_track(track_id: String) -> Result<(), String> {
    let _ = &track_id;
    Ok(())
}

#[command]
fn add_clip(track_id: String, media_id: String, position: f64) -> Result<String, String> {
    let _ = (&track_id, &media_id, position);
    Ok("{}".into())
}

#[command]
fn move_clip(clip_id: String, new_position: f64) -> Result<(), String> {
    let _ = (&clip_id, new_position);
    Ok(())
}

#[command]
fn trim_clip(clip_id: String, start: f64, end: f64) -> Result<(), String> {
    let _ = (&clip_id, start, end);
    Ok(())
}

#[command]
fn split_clip(clip_id: String, at: f64) -> Result<String, String> {
    let _ = (&clip_id, at);
    Ok("{}".into())
}

#[command]
fn delete_clip(clip_id: String) -> Result<(), String> {
    let _ = &clip_id;
    Ok(())
}

// ── Effects commands ──────────────────────────────────────────────────────────

#[command]
fn apply_effect(clip_id: String, effect_type: String) -> Result<String, String> {
    let _ = (&clip_id, &effect_type);
    Ok("{}".into())
}

#[command]
fn update_effect(effect_id: String, params: String) -> Result<(), String> {
    let _ = (&effect_id, &params);
    Ok(())
}

#[command]
fn remove_effect(effect_id: String) -> Result<(), String> {
    let _ = &effect_id;
    Ok(())
}

// ── Caption commands ──────────────────────────────────────────────────────────

#[command]
fn generate_captions(media_id: String) -> Result<String, String> {
    let _ = &media_id;
    Ok("[]".into())
}

#[command]
fn update_caption(caption_id: String, text: String) -> Result<(), String> {
    let _ = (&caption_id, &text);
    Ok(())
}

// ── Export commands ───────────────────────────────────────────────────────────

#[command]
async fn start_export(
    request: ExportRequest,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

    state.export_jobs.lock().map_err(|e| e.to_string())?.insert(job_id.clone(), cancel_tx);

    let job_id_clone = job_id.clone();
    // Convert our ClipRef/ExportRequest to the crate's types via JSON round-trip
    let export_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    tokio::spawn(async move {
        let crate_request: fc_export::ExportRequest =
            serde_json::from_str(&export_json).expect("ExportRequest serde round-trip");
        let result = fc_export::run_export(
            &crate_request.clips,
            &crate_request,
            &job_id_clone,
            &app,
            cancel_rx,
        )
        .await;
        if let Err(e) = result {
            let _ =
                app.emit("export-error", serde_json::json!({ "jobId": job_id_clone, "error": e }));
        } else {
            let _ = app.emit("export-done", serde_json::json!({ "jobId": job_id_clone }));
        }
    });

    Ok(serde_json::json!({ "jobId": job_id }).to_string())
}

#[command]
fn cancel_export(job_id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(sender) = state.export_jobs.lock().map_err(|e| e.to_string())?.remove(&job_id) {
        let _ = sender.send(true);
    }
    Ok(())
}

// ── Preview commands ──────────────────────────────────────────────────────────

#[command]
async fn seek_preview(
    clips_json: String,
    time: f64,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    let clips: Vec<fc_preview::ClipRef> =
        serde_json::from_str(&clips_json).map_err(|e| format!("Invalid clips JSON: {e}"))?;

    fc_preview::decode_frame_for_timeline(&clips, time, width, height)
}

#[command]
fn check_ffmpeg() -> Result<(), String> {
    fc_media::check_ffmpeg()
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Create app data directory for thumbnails, proxies, etc.
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".framecut"));
            std::fs::create_dir_all(&data_dir).ok();

            app.manage(AppState { data_dir, export_jobs: Mutex::new(HashMap::new()) });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Project
            create_project,
            open_project,
            save_project,
            undo,
            redo,
            // Media
            import_media,
            probe_media,
            generate_proxy,
            get_thumbnail,
            get_waveform,
            // Timeline
            add_track,
            remove_track,
            add_clip,
            move_clip,
            trim_clip,
            split_clip,
            delete_clip,
            // Effects
            apply_effect,
            update_effect,
            remove_effect,
            // Captions
            generate_captions,
            update_caption,
            // Export
            start_export,
            cancel_export,
            // Preview
            seek_preview,
            check_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FrameCut");
}
