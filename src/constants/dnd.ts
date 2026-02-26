export const MEDIA_DND_MIME = "application/x-framecut-media";
export const MEDIA_DND_TEXT_PREFIX = "framecut-media:";

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
