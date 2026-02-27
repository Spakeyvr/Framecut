import type { MediaType } from "../types";

export const MEDIA_DND_MIME = "application/x-framecut-media";
export const MEDIA_DND_TEXT_PREFIX = "framecut-media:";

// Module-level state so dragover handlers can know the media type
// (dataTransfer.getData() is blocked during dragover for security).
let _dragMediaType: MediaType | null = null;

export function setDragMediaType(type: MediaType | null) {
  _dragMediaType = type;
}

export function getDragMediaType(): MediaType | null {
  return _dragMediaType;
}

function getTransferTypes(dataTransfer: DataTransfer): string[] {
  const types = dataTransfer.types as unknown as {
    length?: number;
    [index: number]: string;
  };
  if (!types || typeof types.length !== "number") return [];
  const out: string[] = [];
  for (let i = 0; i < types.length; i += 1) {
    const value = types[i];
    if (typeof value === "string") out.push(value);
  }
  return out;
}

export function hasTransferType(dataTransfer: DataTransfer, type: string): boolean {
  const types = dataTransfer.types as unknown as {
    contains?: (value: string) => boolean;
    includes?: (value: string) => boolean;
  };
  if (typeof types?.contains === "function" && types.contains(type)) return true;
  if (typeof types?.includes === "function" && types.includes(type)) return true;
  return getTransferTypes(dataTransfer).includes(type);
}

export function getTransferTypeCount(dataTransfer: DataTransfer): number {
  return getTransferTypes(dataTransfer).length;
}

export function readDraggedMediaId(dataTransfer: DataTransfer): string | null {
  const mediaId = dataTransfer.getData(MEDIA_DND_MIME)?.trim();
  if (mediaId) return mediaId;

  const textCandidates = [
    dataTransfer.getData("text/plain"),
    dataTransfer.getData("text"),
    dataTransfer.getData("Text"),
  ];

  for (const candidate of textCandidates) {
    const text = candidate.trim();
    if (!text) continue;
    if (text.startsWith(MEDIA_DND_TEXT_PREFIX)) {
      return text.slice(MEDIA_DND_TEXT_PREFIX.length);
    }
  }

  return null;
}

function decodeFileUriPath(uri: string): string | null {
  if (!uri.toLowerCase().startsWith("file://")) return null;
  const raw = uri.slice("file://".length);
  const withoutHost = raw.replace(/^localhost\//i, "");
  const decoded = decodeURIComponent(withoutHost);
  // Windows: /C:/Users/... -> C:/Users/...
  return decoded.replace(/^\/([a-zA-Z]:\/)/, "$1");
}

export function readDroppedFilePaths(dataTransfer: DataTransfer): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  const files = Array.from(dataTransfer.files ?? []);
  for (const file of files) {
    const withPath = file as File & { path?: string };
    const path = typeof withPath.path === "string" ? withPath.path.trim() : "";
    if (path && !seen.has(path)) {
      seen.add(path);
      paths.push(path);
    }
  }

  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    const lines = uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    for (const line of lines) {
      const decoded = decodeFileUriPath(line);
      if (decoded && !seen.has(decoded)) {
        seen.add(decoded);
        paths.push(decoded);
      }
    }
  }

  return paths;
}
