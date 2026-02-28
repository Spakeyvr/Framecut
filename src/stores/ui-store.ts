import { create } from "zustand";

export type LeftPanelTab = "media" | "toolbox";

interface UIState {
  // Playback
  playheadTime: number;
  isPlaying: boolean;

  // Selection
  selectedClipId: string | null;

  // Timeline viewport
  timelineZoom: number; // pixels per second
  timelineScrollX: number; // px

  // Left panel
  leftPanelTab: LeftPanelTab;
  leftPanelWidth: number;

  // Inspector panel
  inspectorWidth: number;

  // Timeline panel
  timelineHeight: number;

  // Export dialog
  showExportDialog: boolean;
  showHelpDialog: boolean;

  // Actions
  setPlayheadTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedClipId: (id: string | null) => void;
  setTimelineZoom: (zoom: number) => void;
  setTimelineScrollX: (x: number) => void;
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  setLeftPanelWidth: (width: number) => void;
  setInspectorWidth: (width: number) => void;
  setTimelineHeight: (height: number) => void;
  setShowExportDialog: (show: boolean) => void;
  setShowHelpDialog: (show: boolean) => void;
}

const MIN_ZOOM = 10; // px/s (very zoomed out)
const MAX_ZOOM = 500; // px/s (very zoomed in)

export const useUIStore = create<UIState>()((set) => ({
  playheadTime: 0,
  isPlaying: false,
  selectedClipId: null,
  timelineZoom: 80,
  timelineScrollX: 0,
  leftPanelTab: "media",
  leftPanelWidth: 260,
  inspectorWidth: 240,
  timelineHeight: 280,
  showExportDialog: false,
  showHelpDialog: false,

  setPlayheadTime: (time) => set({ playheadTime: Math.max(0, time) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setSelectedClipId: (id) => set({ selectedClipId: id }),
  setTimelineZoom: (zoom) =>
    set({ timelineZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),
  setTimelineScrollX: (x) => set({ timelineScrollX: Math.max(0, x) }),
  setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
  setLeftPanelWidth: (width) =>
    set({ leftPanelWidth: Math.max(180, Math.min(500, width)) }),
  setInspectorWidth: (width) =>
    set({ inspectorWidth: Math.max(160, Math.min(450, width)) }),
  setTimelineHeight: (height) =>
    set({ timelineHeight: Math.max(120, Math.min(600, height)) }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowHelpDialog: (show) => set({ showHelpDialog: show }),
}));
