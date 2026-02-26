import { useEffect } from "react";
import { useUIStore } from "../stores/ui-store";
import { useProjectStore } from "../stores/project-store";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const ui = useUIStore.getState();
      const project = useProjectStore.getState();

      // Space — play/pause
      if (e.code === "Space") {
        e.preventDefault();
        if (ui.isPlaying) {
          ui.setIsPlaying(false);
        } else {
          const end = project.getTimelineEnd();
          if (ui.playheadTime >= end && end > 0) {
            ui.setPlayheadTime(0);
          }
          ui.setIsPlaying(true);
        }
        return;
      }

      // Delete / Backspace — delete selected clip
      if (e.code === "Delete" || e.code === "Backspace") {
        if (ui.selectedClipId) {
          project.deleteClip(ui.selectedClipId);
          ui.setSelectedClipId(null);
        }
        return;
      }

      // S — split selected clip at playhead
      if (e.code === "KeyS" && !e.ctrlKey && !e.metaKey) {
        if (ui.selectedClipId) {
          project.splitClip(ui.selectedClipId, ui.playheadTime);
        }
        return;
      }

      // Ctrl+Z — undo
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        project.undo();
        return;
      }

      // Ctrl+Shift+Z — redo
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && e.shiftKey) {
        e.preventDefault();
        project.redo();
        return;
      }

      // Ctrl+S — save project (placeholder)
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS" && !e.shiftKey) {
        e.preventDefault();
        // Save will be wired in Phase 6
        return;
      }

      // Left/Right arrow — step playhead
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        ui.setPlayheadTime(Math.max(0, ui.playheadTime - step));
        return;
      }

      if (e.code === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        ui.setPlayheadTime(ui.playheadTime + step);
        return;
      }

      // Home — go to start
      if (e.code === "Home") {
        ui.setPlayheadTime(0);
        return;
      }

      // End — go to end
      if (e.code === "End") {
        ui.setPlayheadTime(project.getTimelineEnd());
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
