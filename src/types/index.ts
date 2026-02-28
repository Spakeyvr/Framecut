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

// ── Text Overlays ─────────────────────────────────────────────────────────────

export interface TextProperties {
  content: string;
  fontFamily: string;
  fontSize: number; // pixels at 1080p reference; scaled during render
  color: string; // CSS color, e.g. "#ffffff"
  x: number; // normalized 0–1 (fraction of frame width)
  y: number; // normalized 0–1 (fraction of frame height)
}

export const DEFAULT_TEXT_PROPERTIES: TextProperties = {
  content: "Text",
  fontFamily: "Arial",
  fontSize: 48,
  color: "#ffffff",
  x: 0.5,
  y: 0.5,
};

export const TEXT_FONT_OPTIONS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Verdana",
  "Impact",
  "Comic Sans MS",
  "Trebuchet MS",
  "Lucida Console",
] as const;

// ── Timeline ──────────────────────────────────────────────────────────────────

export type TrackKind = "video" | "audio";

export interface Clip {
  id: string;
  mediaId: string; // "" for text clips
  trackId: string;
  timelineStart: number; // seconds — position on the timeline
  sourceStart: number; // seconds — trim-in point in the original media
  sourceEnd: number; // seconds — trim-out point in the original media
  textProperties?: TextProperties; // present only for text overlay clips
}

export function isTextClip(clip: Clip): boolean {
  return clip.textProperties !== undefined;
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

export type ExportFormat = "mp4" | "mkv" | "webm";
export type ExportCodec = "libx264" | "libx265" | "libvpx-vp9" | "libaom-av1";

export interface ExportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  codec: string;
  crf: number;
  audioBitrate: string;
  format: ExportFormat;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "1080p-h264",
    label: "1080p H.264 (MP4)",
    width: 1920,
    height: 1080,
    codec: "libx264",
    crf: 20,
    audioBitrate: "192k",
    format: "mp4",
  },
  {
    id: "720p-h264",
    label: "720p H.264 (MP4)",
    width: 1280,
    height: 720,
    codec: "libx264",
    crf: 22,
    audioBitrate: "128k",
    format: "mp4",
  },
  {
    id: "1080p-h265",
    label: "1080p H.265 (MP4)",
    width: 1920,
    height: 1080,
    codec: "libx265",
    crf: 24,
    audioBitrate: "192k",
    format: "mp4",
  },
  {
    id: "4k-h264",
    label: "4K H.264 (MP4)",
    width: 3840,
    height: 2160,
    codec: "libx264",
    crf: 18,
    audioBitrate: "256k",
    format: "mp4",
  },
  {
    id: "1080p-vp9",
    label: "1080p VP9 (WebM)",
    width: 1920,
    height: 1080,
    codec: "libvpx-vp9",
    crf: 30,
    audioBitrate: "128k",
    format: "webm",
  },
];

export const RESOLUTIONS = [
  { label: "4K (3840×2160)", width: 3840, height: 2160 },
  { label: "1440p (2560×1440)", width: 2560, height: 1440 },
  { label: "1080p (1920×1080)", width: 1920, height: 1080 },
  { label: "720p (1280×720)", width: 1280, height: 720 },
  { label: "480p (854×480)", width: 854, height: 480 },
] as const;

export const CODECS = [
  { id: "libx264", label: "H.264", formats: ["mp4", "mkv"] as const },
  { id: "libx265", label: "H.265 / HEVC", formats: ["mp4", "mkv"] as const },
  { id: "libvpx-vp9", label: "VP9", formats: ["webm", "mkv"] as const },
  { id: "libaom-av1", label: "AV1 (slow)", formats: ["webm", "mkv"] as const },
] as const;

export const FORMATS = [
  {
    id: "mp4" as const,
    label: "MP4",
    extension: "mp4",
    codecs: ["libx264", "libx265"] as const,
  },
  {
    id: "mkv" as const,
    label: "MKV",
    extension: "mkv",
    codecs: ["libx264", "libx265", "libvpx-vp9", "libaom-av1"] as const,
  },
  {
    id: "webm" as const,
    label: "WebM",
    extension: "webm",
    codecs: ["libvpx-vp9", "libaom-av1"] as const,
  },
] as const;

export const QUALITY_LEVELS = [
  { label: "Highest", crfH264: 16, crfH265: 20, crfVP9: 24, crfAV1: 22 },
  { label: "High", crfH264: 20, crfH265: 24, crfVP9: 30, crfAV1: 28 },
  { label: "Medium", crfH264: 23, crfH265: 28, crfVP9: 35, crfAV1: 34 },
  { label: "Low", crfH264: 28, crfH265: 32, crfVP9: 40, crfAV1: 40 },
] as const;

export const FRAME_RATES = [
  { label: "24 fps (Film)", value: 24 },
  { label: "25 fps (PAL)", value: 25 },
  { label: "30 fps", value: 30 },
  { label: "50 fps (PAL)", value: 50 },
  { label: "60 fps", value: 60 },
] as const;

export function getCrfForCodec(qualityIndex: number, codec: string): number {
  const q = QUALITY_LEVELS[qualityIndex] ?? QUALITY_LEVELS[1];
  switch (codec) {
    case "libx265":
      return q.crfH265;
    case "libvpx-vp9":
      return q.crfVP9;
    case "libaom-av1":
      return q.crfAV1;
    default:
      return q.crfH264;
  }
}

// ── Hardware Acceleration ─────────────────────────────────────────────────────

export type HwAccelMode = "cpu" | "nvenc" | "qsv" | "amf";

export interface HwAccelOption {
  id: HwAccelMode;
  label: string;
  /** FFmpeg encoder names this vendor provides, keyed by logical codec */
  encoders: Partial<Record<string, string>>;
}

export const HW_ACCEL_OPTIONS: HwAccelOption[] = [
  {
    id: "cpu",
    label: "CPU (Software)",
    encoders: {},
  },
  {
    id: "nvenc",
    label: "NVIDIA NVENC",
    encoders: {
      libx264: "h264_nvenc",
      libx265: "hevc_nvenc",
      "libaom-av1": "av1_nvenc",
    },
  },
  {
    id: "qsv",
    label: "Intel Quick Sync",
    encoders: {
      libx264: "h264_qsv",
      libx265: "hevc_qsv",
    },
  },
  {
    id: "amf",
    label: "AMD AMF",
    encoders: {
      libx264: "h264_amf",
      libx265: "hevc_amf",
    },
  },
];

export function hwAccelSupportsCodec(hwAccel: HwAccelMode, codec: string): boolean {
  if (hwAccel === "cpu") return true;
  const option = HW_ACCEL_OPTIONS.find((o) => o.id === hwAccel);
  return option ? codec in option.encoders : false;
}

// ── IPC payloads ──────────────────────────────────────────────────────────────

/** Minimal clip info sent to Rust for preview/export (no UI fields) */
export interface ClipRef {
  mediaPath: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  hasAudio?: boolean;
}
