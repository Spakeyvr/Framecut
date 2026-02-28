import { useEffect } from "react";
import { useUIStore } from "../stores/ui-store";
import { useProjectStore } from "../stores/project-store";
import { SHORTCUT_BINDINGS } from "../constants/shortcuts";
import {
  openProjectFile,
  saveProject,
  saveProjectDialog,
  confirmUnsavedChanges,
} from "../api/commands";
import type { Project } from "../types";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleSaveAs = async () => {
      const project = useProjectStore.getState();
      const data = JSON.stringify(project.getProjectData(), null, 2);
      const path = await saveProjectDialog(data);
      if (path) {
        project.setFilePath(path);
        project.markClean();
      }
    };

    const handleSave = async () => {
      const project = useProjectStore.getState();
      const data = JSON.stringify(project.getProjectData(), null, 2);
      if (project.filePath) {
        await saveProject(project.filePath, data);
        project.markClean();
      } else {
        await handleSaveAs();
      }
    };

    const handleOpen = async () => {
      const project = useProjectStore.getState();
      if (project.isDirty) {
        const proceed = await confirmUnsavedChanges();
        if (!proceed) return;
      }
      const result = await openProjectFile();
      if (result) {
        const parsed: Project = JSON.parse(result.content);
        project.loadProject(parsed, result.path);
      }
    };

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

      // Delete/Backspace: delete selected clip(s)
      if (e.code === SHORTCUT_BINDINGS.DELETE || e.code === SHORTCUT_BINDINGS.BACKSPACE) {
        e.preventDefault();
        if (ui.selectedClipIds.length > 0) {
          project.deleteClips(ui.selectedClipIds);
          ui.setSelectedClipId(null);
        }
        return;
      }

      // T: add text clip at playhead
      if (e.code === SHORTCUT_BINDINGS.TEXT_TOOL && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const videoTrack = project.tracks.find((t) => t.kind === "video");
        if (videoTrack) {
          const clipId = project.addTextClip(videoTrack.id, ui.playheadTime);
          if (clipId) {
            ui.setSelectedClipId(clipId);
          }
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

      // Ctrl/Cmd+C: copy selected clip(s)
      if ((e.ctrlKey || e.metaKey) && e.code === SHORTCUT_BINDINGS.COPY) {
        e.preventDefault();
        if (ui.selectedClipIds.length > 0) {
          const idSet = new Set(ui.selectedClipIds);
          const clips: import("../types").Clip[] = [];
          for (const t of project.tracks) {
            for (const c of t.clips) {
              if (idSet.has(c.id)) clips.push(structuredClone(c));
            }
          }
          if (clips.length > 0) {
            ui.setClipboardClips(clips);
          }
        }
        return;
      }

      // Ctrl/Cmd+X: cut selected clip(s)
      if ((e.ctrlKey || e.metaKey) && e.code === SHORTCUT_BINDINGS.CUT) {
        e.preventDefault();
        if (ui.selectedClipIds.length > 0) {
          const idSet = new Set(ui.selectedClipIds);
          const clips: import("../types").Clip[] = [];
          for (const t of project.tracks) {
            for (const c of t.clips) {
              if (idSet.has(c.id)) clips.push(structuredClone(c));
            }
          }
          if (clips.length > 0) {
            ui.setClipboardClips(clips);
            project.deleteClips(ui.selectedClipIds);
            ui.setSelectedClipId(null);
          }
        }
        return;
      }

      // Ctrl/Cmd+V: paste clip(s) at playhead
      if ((e.ctrlKey || e.metaKey) && e.code === SHORTCUT_BINDINGS.PASTE) {
        e.preventDefault();
        const clipDataList = ui.clipboardClips;
        if (clipDataList.length > 0) {
          // Find the earliest clip start to compute relative offsets
          const earliest = Math.min(...clipDataList.map((c) => c.timelineStart));
          project.pushSnapshot();
          const pastedIds: string[] = [];

          for (const clipData of clipDataList) {
            const offset = clipData.timelineStart - earliest;
            const pasteTime = ui.playheadTime + offset;

            // Resolve target track: original track, then fallback by kind
            const isText = clipData.textProperties !== undefined;
            const trackKind = isText ? "video" : undefined;
            let targetTrack = project.tracks.find((t) => t.id === clipData.trackId);
            if (!targetTrack && trackKind) {
              targetTrack = project.tracks.find((t) => t.kind === trackKind);
            }
            if (!targetTrack) {
              const sourceTrack = project.tracks.find((t) =>
                t.clips.some((c) => c.mediaId === clipData.mediaId),
              );
              const kind = sourceTrack?.kind;
              if (kind) {
                targetTrack = project.tracks.find((t) => t.kind === kind);
              }
            }
            if (!targetTrack) {
              targetTrack = project.tracks[0];
            }
            if (targetTrack) {
              const newId = project.pasteClip(clipData, targetTrack.id, pasteTime, true);
              if (newId) pastedIds.push(newId);
            }
          }

          // Select all pasted clips
          if (pastedIds.length > 0) {
            ui.setSelectedClipId(pastedIds[0]);
            for (let i = 1; i < pastedIds.length; i++) {
              ui.toggleClipSelection(pastedIds[i]);
            }
          }
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

      // Ctrl/Cmd+Shift+S: save project as
      if ((e.ctrlKey || e.metaKey) && e.code === SHORTCUT_BINDINGS.SAVE && e.shiftKey) {
        e.preventDefault();
        handleSaveAs();
        return;
      }

      // Ctrl/Cmd+S: save project
      if ((e.ctrlKey || e.metaKey) && e.code === SHORTCUT_BINDINGS.SAVE && !e.shiftKey) {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl/Cmd+O: open project
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyO") {
        e.preventDefault();
        handleOpen();
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
