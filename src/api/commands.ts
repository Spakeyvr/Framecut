import { invoke } from "@tauri-apps/api/core";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import type { MediaItem, ClipRef, TextOverlayRef } from "../types";

// ── FFmpeg check ─────────────────────────────────────────────────────────────

export const checkFfmpeg = () => invoke<void>("check_ffmpeg");

// ── Project ──────────────────────────────────────────────────────────────────

export const createProject = (name: string) => invoke<string>("create_project", { name });

export const openProjectFile = async (): Promise<{
  path: string;
  content: string;
} | null> => {
  const selected = await open({
    filters: [{ name: "FrameCut Project", extensions: ["fcproj"] }],
  });
  if (!selected) return null;
  // open() returns string | string[] | null in @tauri-apps/plugin-dialog v2
  const filePath = Array.isArray(selected) ? selected[0] : selected;
  const content = await invoke<string>("open_project", { path: filePath });
  return { path: filePath, content };
};

export const saveProject = (path: string, data: string) =>
  invoke<void>("save_project", { path, data });

export const saveProjectDialog = async (data: string): Promise<string | null> => {
  const path = await save({
    filters: [{ name: "FrameCut Project", extensions: ["fcproj"] }],
  });
  if (!path) return null;
  await saveProject(path, data);
  return path;
};

export const confirmUnsavedChanges = (): Promise<boolean> =>
  confirm("You have unsaved changes. Do you want to continue without saving?", {
    title: "Unsaved Changes",
    kind: "warning",
    okLabel: "Continue",
    cancelLabel: "Cancel",
  });

// ── Media ────────────────────────────────────────────────────────────────────

interface MediaItemResponse {
  id: string;
  name: string;
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  has_audio: boolean;
  thumbnail_path: string;
  type: string;
}

export const importMediaDialog = async (): Promise<MediaItem[]> => {
  const result = await open({
    multiple: true,
    filters: [
      {
        name: "Media Files",
        extensions: [
          "mp4",
          "mkv",
          "avi",
          "mov",
          "webm",
          "mp3",
          "wav",
          "aac",
          "flac",
          "ogg",
          "png",
          "jpg",
          "jpeg",
          "gif",
          "bmp",
        ],
      },
    ],
  });
  if (!result || (Array.isArray(result) && result.length === 0)) return [];

  const paths = Array.isArray(result) ? result : [result];
  const json = await invoke<string>("import_media", { paths });
  const items: MediaItemResponse[] = JSON.parse(json);

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    path: item.path,
    duration: item.duration,
    width: item.width,
    height: item.height,
    fps: item.fps,
    hasAudio: item.has_audio,
    thumbnailPath: item.thumbnail_path || undefined,
    type: item.type as MediaItem["type"],
  }));
};

export const probeMedia = (path: string) => invoke<string>("probe_media", { path });

export const getThumbnail = (path: string, time: number) =>
  invoke<string>("get_thumbnail", { path, time });

// ── Preview ──────────────────────────────────────────────────────────────────

export const seekPreview = (
  clipsJson: string,
  time: number,
  width: number,
  height: number,
  tier: number,
): Promise<Uint8Array> =>
  invoke<Uint8Array | ArrayBuffer | number[]>("seek_preview", {
    clipsJson,
    time,
    width,
    height,
    tier,
  }).then((payload) => {
    if (payload instanceof Uint8Array) return payload;
    if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
    return Uint8Array.from(payload);
  });

// ── Export ────────────────────────────────────────────────────────────────────

export interface ExportRequestPayload {
  clips: ClipRef[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  codec: string;
  crf: number;
  audioBitrate: string;
  format: string;
  hwAccel: string;
  textOverlays?: TextOverlayRef[];
}

export const startExport = async (payload: ExportRequestPayload): Promise<string> => {
  const request = {
    clips: payload.clips.map((c) => ({
      media_path: c.mediaPath,
      source_start: c.sourceStart,
      source_end: c.sourceEnd,
      timeline_start: c.timelineStart,
      has_audio: c.hasAudio ?? false,
    })),
    output_path: payload.outputPath,
    width: payload.width,
    height: payload.height,
    fps: payload.fps,
    codec: payload.codec,
    crf: payload.crf,
    audio_bitrate: payload.audioBitrate,
    format: payload.format,
    hw_accel: payload.hwAccel,
    text_overlays: (payload.textOverlays ?? []).map((t) => ({
      content: t.content,
      font_family: t.fontFamily,
      font_size: t.fontSize,
      color: t.color,
      x: t.x,
      y: t.y,
      output_start: t.outputStart,
      output_end: t.outputEnd,
    })),
  };
  const json = await invoke<string>("start_export", { request });
  const result = JSON.parse(json);
  return result.jobId;
};

export const cancelExport = (jobId: string) => invoke<void>("cancel_export", { jobId });

export const detectHwEncoders = (): Promise<string[]> =>
  invoke<string>("detect_hw_encoders").then((json) => JSON.parse(json));
