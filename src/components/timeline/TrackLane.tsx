import { useCallback, useState } from "react";
import type { Track } from "../../types";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import {
  MEDIA_DND_MIME,
  getTransferTypeCount,
  hasTransferType,
  readDraggedMediaId,
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Always allow drop while dragging; then validate payload on drop.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";

    // Some WebViews expose drag types via DOMStringList.contains only.
    const hasSupportedType =
      hasTransferType(e.dataTransfer, MEDIA_DND_MIME) ||
      hasTransferType(e.dataTransfer, "text/plain") ||
      hasTransferType(e.dataTransfer, "text") ||
      getTransferTypeCount(e.dataTransfer) === 0;
    setIsDragOver(hasSupportedType);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const mediaId = readDraggedMediaId(e.dataTransfer);
      if (!mediaId) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const timelineStart = (x + scrollX) / zoom;
      addClip(track.id, mediaId, Math.max(0, timelineStart));
    },
    [track.id, zoom, scrollX, addClip],
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
