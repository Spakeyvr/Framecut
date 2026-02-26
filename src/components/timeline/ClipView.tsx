import { useRef, useCallback } from "react";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import type { Clip, Track } from "../../types";
import { clipDuration } from "../../types";

interface ClipViewProps {
  clip: Clip;
  track: Track;
}

export function ClipView({ clip, track }: ClipViewProps) {
  const zoom = useUIStore((s) => s.timelineZoom);
  const scrollX = useUIStore((s) => s.timelineScrollX);
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const setSelectedClipId = useUIStore((s) => s.setSelectedClipId);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const moveClip = useProjectStore((s) => s.moveClip);
  const trimClip = useProjectStore((s) => s.trimClip);
  const splitClip = useProjectStore((s) => s.splitClip);
  const deleteClip = useProjectStore((s) => s.deleteClip);
  const media = useProjectStore((s) => s.media);

  const mediaItem = media.find((m) => m.id === clip.mediaId);
  const isSelected = selectedClipId === clip.id;
  const duration = clipDuration(clip);

  const left = clip.timelineStart * zoom - scrollX;
  const width = duration * zoom;

  // Drag state refs (not React state to avoid re-renders during drag)
  const dragRef = useRef<{
    type: "move" | "trim-left" | "trim-right";
    startX: number;
    origTimelineStart: number;
    origSourceStart: number;
    origSourceEnd: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: "move" | "trim-left" | "trim-right") => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedClipId(clip.id);

      dragRef.current = {
        type,
        startX: e.clientX,
        origTimelineStart: clip.timelineStart,
        origSourceStart: clip.sourceStart,
        origSourceEnd: clip.sourceEnd,
      };

      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const handleMove = (me: PointerEvent) => {
        if (!dragRef.current) return;
        const dx = me.clientX - dragRef.current.startX;
        const dt = dx / zoom;

        if (dragRef.current.type === "move") {
          const newStart = Math.max(0, dragRef.current.origTimelineStart + dt);
          moveClip(clip.id, track.id, newStart);
        } else if (dragRef.current.type === "trim-left") {
          const maxTrim = dragRef.current.origSourceEnd - 0.1;
          const newSourceStart = Math.max(
            0,
            Math.min(maxTrim, dragRef.current.origSourceStart + dt),
          );
          trimClip(clip.id, newSourceStart, null);
        } else if (dragRef.current.type === "trim-right") {
          const minEnd = dragRef.current.origSourceStart + 0.1;
          const newSourceEnd = Math.max(minEnd, dragRef.current.origSourceEnd + dt);
          trimClip(clip.id, null, newSourceEnd);
        }
      };

      const handleUp = () => {
        dragRef.current = null;
        el.removeEventListener("pointermove", handleMove);
        el.removeEventListener("pointerup", handleUp);
      };

      el.addEventListener("pointermove", handleMove);
      el.addEventListener("pointerup", handleUp);
    },
    [clip, track.id, zoom, setSelectedClipId, moveClip, trimClip],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setSelectedClipId(clip.id);

      // Simple context menu via prompt-style approach
      // A proper context menu component would be better, but for MVP:
      const action = window.prompt("Action: split / delete / cancel", "split");
      if (action === "split") {
        splitClip(clip.id, playheadTime);
      } else if (action === "delete") {
        deleteClip(clip.id);
      }
    },
    [clip.id, playheadTime, setSelectedClipId, splitClip, deleteClip],
  );

  // Don't render if off-screen
  if (left + width < -100 || left > window.innerWidth + 100) return null;

  return (
    <div
      className={`clip clip--${track.kind} ${isSelected ? "clip--selected" : ""}`}
      style={{ left, width: Math.max(width, 2) }}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedClipId(clip.id);
      }}
      onContextMenu={handleContextMenu}
      onPointerDown={(e) => handlePointerDown(e, "move")}
    >
      {/* Left trim handle */}
      <div
        className="clip-handle clip-handle--left"
        onPointerDown={(e) => handlePointerDown(e, "trim-left")}
      />

      <span className="clip-label">{mediaItem?.name ?? "?"}</span>

      {/* Right trim handle */}
      <div
        className="clip-handle clip-handle--right"
        onPointerDown={(e) => handlePointerDown(e, "trim-right")}
      />
    </div>
  );
}
