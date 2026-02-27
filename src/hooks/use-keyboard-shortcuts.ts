import { useEffect } from "react";
import { useUIStore } from "../stores/ui-store";
import { useProjectStore } from "../stores/project-store";
import { SHORTCUT_BINDINGS } from "../constants/shortcuts";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      const ui = useUIStore.getState();
      const project = useProjectStore.getState();
      const hasContextMenuOpen = Boolean(document.querySelector(".context-menu"));

      if (e.code === "Escape") {
        if (hasContextMenuOpen) {
          e.preventDefault();
          window.dispatchEvent(new Event("framecut-close-context-menus"));
          return;
        }
        if (ui.showHelpDialog) {
          e.preventDefault();
          ui.setShowHelpDialog(false);
          return;
        }
      }

      // Open help with F1 or ?
      if (
        e.code === SHORTCUT_BINDINGS.HELP_F1 ||
        (e.code === SHORTCUT_BINDINGS.HELP_QUESTION && e.shiftKey)
      ) {
        e.preventDefault();
        ui.setShowHelpDialog(true);
        return;
      }

      // Keep global shortcuts idle while a dialog is open.
      if (ui.showExportDialog || ui.showHelpDialog) {
        return;
      }

      // Space: play/pause
      if (e.code === SHORTCUT_BINDINGS.PLAY_PAUSE) {
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

      // Delete/Backspace: delete selected clip
      if (
        e.code === SHORTCUT_BINDINGS.DELETE ||
        e.code === SHORTCUT_BINDINGS.BACKSPACE
      ) {
        e.preventDefault();
        if (ui.selectedClipId) {
          project.deleteClip(ui.selectedClipId);
          ui.setSelectedClipId(null);
        }
        return;
      }

      // S: split selected clip at playhead
      if (e.code === SHORTCUT_BINDINGS.SPLIT && !e.ctrlKey && !e.metaKey) {
        if (ui.selectedClipId) {
          project.splitClip(ui.selectedClipId, ui.playheadTime);
        }
        return;
      }

      // Ctrl/Cmd+Z: undo
      if (
        (e.ctrlKey || e.metaKey) &&
        e.code === SHORTCUT_BINDINGS.UNDO_REDO &&
        !e.shiftKey
      ) {
        e.preventDefault();
        project.undo();
        return;
      }

      // Ctrl/Cmd+Shift+Z: redo
      if (
        (e.ctrlKey || e.metaKey) &&
        e.code === SHORTCUT_BINDINGS.UNDO_REDO &&
        e.shiftKey
      ) {
        e.preventDefault();
        project.redo();
        return;
      }

      // Ctrl/Cmd+S: save project (placeholder)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.code === SHORTCUT_BINDINGS.SAVE &&
        !e.shiftKey
      ) {
        e.preventDefault();
        return;
      }

      // Left/Right arrow: step playhead
      if (e.code === SHORTCUT_BINDINGS.ARROW_LEFT) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        ui.setPlayheadTime(Math.max(0, ui.playheadTime - step));
        return;
      }

      if (e.code === SHORTCUT_BINDINGS.ARROW_RIGHT) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        ui.setPlayheadTime(ui.playheadTime + step);
        return;
      }

      // Home: go to start
      if (e.code === SHORTCUT_BINDINGS.HOME) {
        ui.setPlayheadTime(0);
        return;
      }

      // End: go to end
      if (e.code === SHORTCUT_BINDINGS.END) {
        ui.setPlayheadTime(project.getTimelineEnd());
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
