// ── Media ─────────────────────────────────────────────────────────────────────

export type MediaType = "video" | "audio" | "image";

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  proxyPath?: string;
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  thumbnailPath?: string;
  thumbnailStripPath?: string;
  type: MediaType;
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export type TrackKind = "video" | "audio";

export interface Clip {
  id: string;
  mediaId: string;
  trackId: string;
  timelineStart: number; // seconds — position on the timeline
  sourceStart: number; // seconds — trim-in point in the original media
  sourceEnd: number; // seconds — trim-out point in the original media
}

/** Derived helper — not stored, computed on the fly */
export function clipDuration(clip: Clip): number {
  return clip.sourceEnd - clip.sourceStart;
}

/** End position on the timeline */
export function clipEnd(clip: Clip): number {
  return clip.timelineStart + clipDuration(clip);
}

export interface Track {
  id: string;
  kind: TrackKind;
  clips: Clip[];
  muted: boolean;
  visible: boolean;
}

// ── Project ───────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  media: MediaItem[];
  tracks: Track[];
  fps: number;
  width: number;
  height: number;
}

// ── Export ─────────────────────────────────────────────────────────────────────

export interface ExportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  codec: string;
  crf: number;
  audioBitrate: string;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "1080p",
    label: "1080p H.264",
    width: 1920,
    height: 1080,
    codec: "libx264",
    crf: 20,
    audioBitrate: "192k",
  },
  {
    id: "720p",
    label: "720p H.264",
    width: 1280,
    height: 720,
    codec: "libx264",
    crf: 22,
    audioBitrate: "128k",
  },
];

// ── IPC payloads ──────────────────────────────────────────────────────────────

/** Minimal clip info sent to Rust for preview/export (no UI fields) */
export interface ClipRef {
  mediaPath: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  hasAudio?: boolean;
}
