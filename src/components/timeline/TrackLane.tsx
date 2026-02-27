import { useCallback, useState } from "react";
import type { Track } from "../../types";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import {
  MEDIA_DND_MIME,
  getTransferTypeCount,
  hasTransferType,
  readDraggedMediaId,
  getDragMediaType,
} from "../../constants/dnd";
import { ClipView } from "./ClipView";

interface TrackLaneProps {
  track: Track;
}

export function TrackLane({ track }: TrackLaneProps) {
  const addClip = useProjectStore((s) => s.addClip);
  const zoom = useUIStore((s) => s.timelineZoom);
  const scrollX = useUIStore((s) => s.timelineScrollX);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      const hasSupportedType =
        hasTransferType(e.dataTransfer, MEDIA_DND_MIME) ||
        hasTransferType(e.dataTransfer, "text/plain") ||
        hasTransferType(e.dataTransfer, "text") ||
        getTransferTypeCount(e.dataTransfer) === 0;

      // Only accept if the media kind matches this track kind.
      const mediaType = getDragMediaType();
      const kindMatch =
        !mediaType ||
        (track.kind === "video" && (mediaType === "video" || mediaType === "image")) ||
        (track.kind === "audio" && mediaType === "audio");

      if (hasSupportedType && kindMatch) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      } else {
        setIsDragOver(false);
      }
    },
    [track.kind],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const mediaId = readDraggedMediaId(e.dataTransfer);
      if (!mediaId) return;

      // Validate media type matches this track kind.
      const mediaType = getDragMediaType();
      if (mediaType) {
        const kindMatch =
          (track.kind === "video" && (mediaType === "video" || mediaType === "image")) ||
          (track.kind === "audio" && mediaType === "audio");
        if (!kindMatch) return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const timelineStart = (x + scrollX) / zoom;
      addClip(track.id, mediaId, Math.max(0, timelineStart));
    },
    [track.id, track.kind, zoom, scrollX, addClip],
  );

  return (
    <div
      className={`track-lane ${isDragOver ? "track-lane--drop-target" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {track.clips.map((clip) => (
        <ClipView key={clip.id} clip={clip} track={track} />
      ))}
    </div>
  );
}
