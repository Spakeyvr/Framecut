import { create } from "zustand";

interface UIState {
  // Playback
  playheadTime: number;
  isPlaying: boolean;

  // Selection
  selectedClipId: string | null;

  // Timeline viewport
  timelineZoom: number; // pixels per second
  timelineScrollX: number; // px

  // Export dialog
  showExportDialog: boolean;

  // Actions
  setPlayheadTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedClipId: (id: string | null) => void;
  setTimelineZoom: (zoom: number) => void;
  setTimelineScrollX: (x: number) => void;
  setShowExportDialog: (show: boolean) => void;
}

const MIN_ZOOM = 10; // px/s (very zoomed out)
const MAX_ZOOM = 500; // px/s (very zoomed in)

export const useUIStore = create<UIState>()((set) => ({
  playheadTime: 0,
  isPlaying: false,
  selectedClipId: null,
  timelineZoom: 80,
  timelineScrollX: 0,
  showExportDialog: false,

  setPlayheadTime: (time) => set({ playheadTime: Math.max(0, time) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setSelectedClipId: (id) => set({ selectedClipId: id }),
  setTimelineZoom: (zoom) =>
    set({ timelineZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),
  setTimelineScrollX: (x) => set({ timelineScrollX: Math.max(0, x) }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
}));
