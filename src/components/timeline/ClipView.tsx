import { useEffect, useRef, useState, useCallback } from "react";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import type { Clip, Track } from "../../types";
import { clipDuration, isTextClip } from "../../types";

interface ClipViewProps {
  clip: Clip;
  track: Track;
}

interface ContextMenuState {
  x: number;
  y: number;
}

export function ClipView({ clip, track }: ClipViewProps) {
  const zoom = useUIStore((s) => s.timelineZoom);
  const scrollX = useUIStore((s) => s.timelineScrollX);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const setSelectedClipId = useUIStore((s) => s.setSelectedClipId);
  const toggleClipSelection = useUIStore((s) => s.toggleClipSelection);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const moveClip = useProjectStore((s) => s.moveClip);
  const trimClip = useProjectStore((s) => s.trimClip);
  const splitClip = useProjectStore((s) => s.splitClip);
  const deleteClip = useProjectStore((s) => s.deleteClip);
  const deleteClips = useProjectStore((s) => s.deleteClips);
  const pushSnapshot = useProjectStore((s) => s.pushSnapshot);
  const media = useProjectStore((s) => s.media);

  const mediaItem = media.find((m) => m.id === clip.mediaId);
  const isText = isTextClip(clip);
  const isSelected = selectedClipIds.includes(clip.id);
  const duration = clipDuration(clip);

  const left = clip.timelineStart * zoom - scrollX;
  const width = duration * zoom;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Drag state refs (not React state to avoid re-renders during drag)
  const dragRef = useRef<{
    type: "move" | "trim-left" | "trim-right";
    startX: number;
    origTimelineStart: number;
    origSourceStart: number;
    origSourceEnd: number;
    snapshotTaken: boolean;
  } | null>(null);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    const closeFromEvent = () => setContextMenu(null);

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("framecut-close-context-menus", closeFromEvent);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("framecut-close-context-menus", closeFromEvent);
    };
  }, []);

  const maybePushSnapshot = useCallback(() => {
    if (!dragRef.current || dragRef.current.snapshotTaken) return;
    pushSnapshot();
    dragRef.current.snapshotTaken = true;
  }, [pushSnapshot]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: "move" | "trim-left" | "trim-right") => {
      e.stopPropagation();
      e.preventDefault();
      setContextMenu(null);
      setSelectedClipId(clip.id);

      dragRef.current = {
        type,
        startX: e.clientX,
        origTimelineStart: clip.timelineStart,
        origSourceStart: clip.sourceStart,
        origSourceEnd: clip.sourceEnd,
        snapshotTaken: false,
      };

      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      const handleMove = (me: PointerEvent) => {
        if (!dragRef.current) return;
        const dx = me.clientX - dragRef.current.startX;
        const dt = dx / zoom;

        if (dragRef.current.type === "move") {
          const newStart = Math.max(0, dragRef.current.origTimelineStart + dt);
          if (Math.abs(newStart - clip.timelineStart) > 0.001) {
            maybePushSnapshot();
          }
          moveClip(clip.id, track.id, newStart);
        } else if (dragRef.current.type === "trim-left") {
          const maxTrim = dragRef.current.origSourceEnd - 0.1;
          const newSourceStart = Math.max(
            0,
            Math.min(maxTrim, dragRef.current.origSourceStart + dt),
          );
          if (Math.abs(newSourceStart - clip.sourceStart) > 0.001) {
            maybePushSnapshot();
          }
          trimClip(clip.id, newSourceStart, null);
        } else if (dragRef.current.type === "trim-right") {
          const minEnd = dragRef.current.origSourceStart + 0.1;
          const newSourceEnd = Math.max(minEnd, dragRef.current.origSourceEnd + dt);
          if (Math.abs(newSourceEnd - clip.sourceEnd) > 0.001) {
            maybePushSnapshot();
          }
          trimClip(clip.id, null, newSourceEnd);
        }
      };

      const handleUp = () => {
        dragRef.current = null;
        el.removeEventListener("pointermove", handleMove);
        el.removeEventListener("pointerup", handleUp);
        el.removeEventListener("pointercancel", handleUp);
      };

      el.addEventListener("pointermove", handleMove);
      el.addEventListener("pointerup", handleUp);
      el.addEventListener("pointercancel", handleUp);
    },
    [
      clip.id,
      clip.timelineStart,
      clip.sourceStart,
      clip.sourceEnd,
      track.id,
      zoom,
      setSelectedClipId,
      maybePushSnapshot,
      moveClip,
      trimClip,
    ],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedClipId(clip.id);
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [clip.id, setSelectedClipId],
  );

  if (left + width < -100 || left > window.innerWidth + 100) return null;

  return (
    <>
      <div
        className={`clip ${isText ? "clip--text" : `clip--${track.kind}`} ${isSelected ? "clip--selected" : ""}`}
        style={{ left, width: Math.max(width, 2) }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) {
            toggleClipSelection(clip.id);
          } else {
            setSelectedClipId(clip.id);
          }
        }}
        onContextMenu={handleContextMenu}
        onPointerDown={(e) => handlePointerDown(e, "move")}
      >
        <div
          className="clip-handle clip-handle--left"
          onPointerDown={(e) => handlePointerDown(e, "trim-left")}
        />

        <span className="clip-label">
          {isText ? `T: ${clip.textProperties!.content}` : (mediaItem?.name ?? "?")}
        </span>

        <div
          className="clip-handle clip-handle--right"
          onPointerDown={(e) => handlePointerDown(e, "trim-right")}
        />
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              splitClip(clip.id, playheadTime);
              setContextMenu(null);
            }}
          >
            Split at Playhead
          </button>
          <div className="context-menu-sep" />
          <button
            className="context-menu-item context-menu-item--danger"
            onClick={() => {
              if (selectedClipIds.includes(clip.id) && selectedClipIds.length > 1) {
                deleteClips(selectedClipIds);
              } else {
                deleteClip(clip.id);
              }
              setSelectedClipId(null);
              setContextMenu(null);
            }}
          >
            {selectedClipIds.includes(clip.id) && selectedClipIds.length > 1
              ? `Delete ${selectedClipIds.length} Clips`
              : "Delete Clip"}
          </button>
        </div>
      )}
    </>
  );
}
