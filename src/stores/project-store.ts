import { create } from "zustand";
import { nanoid } from "nanoid";
import type { MediaItem, Clip, Track, TrackKind, Project } from "../types";
import { clipEnd } from "../types";

// ── Undo / Redo snapshot types ────────────────────────────────────────────────

interface Snapshot {
  media: MediaItem[];
  tracks: Track[];
}

const MAX_UNDO = 50;

// ── Store shape ───────────────────────────────────────────────────────────────

interface ProjectState {
  // Project metadata
  projectId: string;
  projectName: string;
  projectFps: number;
  projectWidth: number;
  projectHeight: number;

  // Data
  media: MediaItem[];
  tracks: Track[];

  // File management
  filePath: string | null;
  isDirty: boolean;

  // Undo / Redo
  undoStack: Snapshot[];
  redoStack: Snapshot[];

  // Actions — file management
  getProjectData: () => Project;
  setFilePath: (path: string | null) => void;
  markClean: () => void;
  resetProject: () => void;

  // Actions — media
  addMedia: (items: MediaItem[]) => void;
  removeMedia: (id: string) => void;
  getMediaById: (id: string) => MediaItem | undefined;

  // Actions — tracks
  addTrack: (kind: TrackKind) => string;
  removeTrack: (id: string) => void;
  toggleTrackMute: (id: string) => void;
  toggleTrackVisibility: (id: string) => void;

  // Actions — clips
  addClip: (trackId: string, mediaId: string, timelineStart: number) => string | null;
  moveClip: (clipId: string, newTrackId: string, newTimelineStart: number) => boolean;
  trimClip: (
    clipId: string,
    newSourceStart: number | null,
    newSourceEnd: number | null,
  ) => void;
  splitClip: (clipId: string, atTimelineTime: number) => void;
  deleteClip: (clipId: string) => void;

  // Actions — undo/redo
  undo: () => void;
  redo: () => void;
  pushSnapshot: () => void;

  // Queries
  getTimelineEnd: () => number;
  getClipsAtTime: (time: number) => { clip: Clip; media: MediaItem }[];

  // Project save/load
  loadProject: (data: Project, filePath: string | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clipsOverlap(a: Clip, b: Clip): boolean {
  return a.timelineStart < clipEnd(b) && clipEnd(a) > b.timelineStart;
}

function wouldOverlap(clip: Clip, track: Track, excludeClipId?: string): boolean {
  return track.clips.some((c) => c.id !== excludeClipId && clipsOverlap(clip, c));
}

function sortClips(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.timelineStart - b.timelineStart);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projectId: nanoid(),
  projectName: "Untitled Project",
  projectFps: 30,
  projectWidth: 1920,
  projectHeight: 1080,

  media: [],
  tracks: [
    { id: nanoid(), kind: "video", clips: [], muted: false, visible: true },
    { id: nanoid(), kind: "audio", clips: [], muted: false, visible: true },
  ],

  filePath: null,
  isDirty: false,

  undoStack: [],
  redoStack: [],

  // ── File management ──────────────────────────────────────────────────────

  getProjectData: () => {
    const { projectId, projectName, media, tracks, projectFps, projectWidth, projectHeight } =
      get();
    return {
      id: projectId,
      name: projectName,
      media,
      tracks,
      fps: projectFps,
      width: projectWidth,
      height: projectHeight,
    };
  },

  setFilePath: (path) => set({ filePath: path }),

  markClean: () => set({ isDirty: false }),

  resetProject: () => {
    set({
      projectId: nanoid(),
      projectName: "Untitled Project",
      projectFps: 30,
      projectWidth: 1920,
      projectHeight: 1080,
      media: [],
      tracks: [
        { id: nanoid(), kind: "video", clips: [], muted: false, visible: true },
        { id: nanoid(), kind: "audio", clips: [], muted: false, visible: true },
      ],
      undoStack: [],
      redoStack: [],
      filePath: null,
      isDirty: false,
    });
  },

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  pushSnapshot: () => {
    const { media, tracks, undoStack } = get();
    const snapshot: Snapshot = {
      media: structuredClone(media),
      tracks: structuredClone(tracks),
    };
    const newStack =
      undoStack.length >= MAX_UNDO
        ? [...undoStack.slice(1), snapshot]
        : [...undoStack, snapshot];
    set({ undoStack: newStack, redoStack: [] });
  },

  undo: () => {
    const { undoStack, media, tracks } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set((s) => ({
      media: prev.media,
      tracks: prev.tracks,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [
        ...s.redoStack,
        { media: structuredClone(media), tracks: structuredClone(tracks) },
      ],
      isDirty: true,
    }));
  },

  redo: () => {
    const { redoStack, media, tracks } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set((s) => ({
      media: next.media,
      tracks: next.tracks,
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [
        ...s.undoStack,
        { media: structuredClone(media), tracks: structuredClone(tracks) },
      ],
      isDirty: true,
    }));
  },

  // ── Media ─────────────────────────────────────────────────────────────────

  addMedia: (items) => {
    get().pushSnapshot();
    set((s) => ({ media: [...s.media, ...items], isDirty: true }));
  },

  removeMedia: (id) => {
    get().pushSnapshot();
    set((s) => ({
      media: s.media.filter((m) => m.id !== id),
      // Also remove any clips using this media
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.mediaId !== id),
      })),
      isDirty: true,
    }));
  },

  getMediaById: (id) => get().media.find((m) => m.id === id),

  // ── Tracks ────────────────────────────────────────────────────────────────

  addTrack: (kind) => {
    const id = nanoid();
    get().pushSnapshot();
    set((s) => ({
      tracks: [...s.tracks, { id, kind, clips: [], muted: false, visible: true }],
      isDirty: true,
    }));
    return id;
  },

  removeTrack: (id) => {
    get().pushSnapshot();
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id), isDirty: true }));
  },

  toggleTrackMute: (id) =>
    set((s) => {
      const snapshot: Snapshot = {
        media: structuredClone(s.media),
        tracks: structuredClone(s.tracks),
      };
      const undoStack =
        s.undoStack.length >= MAX_UNDO
          ? [...s.undoStack.slice(1), snapshot]
          : [...s.undoStack, snapshot];
      return {
        tracks: s.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)),
        undoStack,
        redoStack: [],
        isDirty: true,
      };
    }),

  toggleTrackVisibility: (id) =>
    set((s) => {
      const snapshot: Snapshot = {
        media: structuredClone(s.media),
        tracks: structuredClone(s.tracks),
      };
      const undoStack =
        s.undoStack.length >= MAX_UNDO
          ? [...s.undoStack.slice(1), snapshot]
          : [...s.undoStack, snapshot];
      return {
        tracks: s.tracks.map((t) => (t.id === id ? { ...t, visible: !t.visible } : t)),
        undoStack,
        redoStack: [],
        isDirty: true,
      };
    }),

  // ── Clips ─────────────────────────────────────────────────────────────────

  addClip: (trackId, mediaId, timelineStart) => {
    const { tracks, media } = get();
    const track = tracks.find((t) => t.id === trackId);
    const mediaItem = media.find((m) => m.id === mediaId);
    if (!track || !mediaItem) return null;

    const clipId = nanoid();
    const newClip: Clip = {
      id: clipId,
      mediaId,
      trackId,
      timelineStart: Math.max(0, timelineStart),
      sourceStart: 0,
      sourceEnd: mediaItem.duration,
    };

    if (wouldOverlap(newClip, track)) return null;

    get().pushSnapshot();
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: sortClips([...t.clips, newClip]) } : t,
      ),
      isDirty: true,
    }));
    return clipId;
  },

  moveClip: (clipId, newTrackId, newTimelineStart) => {
    const { tracks } = get();
    let sourceClip: Clip | undefined;
    let sourceTrackId: string | undefined;

    for (const track of tracks) {
      const found = track.clips.find((c) => c.id === clipId);
      if (found) {
        sourceClip = found;
        sourceTrackId = track.id;
        break;
      }
    }
    if (!sourceClip || !sourceTrackId) return false;

    const movedClip: Clip = {
      ...sourceClip,
      trackId: newTrackId,
      timelineStart: Math.max(0, newTimelineStart),
    };

    const destTrack = tracks.find((t) => t.id === newTrackId);
    if (!destTrack) return false;
    if (wouldOverlap(movedClip, destTrack, clipId)) return false;

    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id === sourceTrackId && t.id === newTrackId) {
          // Same track — replace in place
          return {
            ...t,
            clips: sortClips(t.clips.map((c) => (c.id === clipId ? movedClip : c))),
          };
        }
        if (t.id === sourceTrackId) {
          return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
        }
        if (t.id === newTrackId) {
          return { ...t, clips: sortClips([...t.clips, movedClip]) };
        }
        return t;
      }),
      isDirty: true,
    }));
    return true;
  },

  trimClip: (clipId, newSourceStart, newSourceEnd) => {
    const { tracks, media } = get();
    let clip: Clip | undefined;
    for (const t of tracks) {
      clip = t.clips.find((c) => c.id === clipId);
      if (clip) break;
    }
    if (!clip) return;

    const mediaItem = media.find((m) => m.id === clip!.mediaId);
    if (!mediaItem) return;

    const ss = newSourceStart !== null ? newSourceStart : clip.sourceStart;
    const se = newSourceEnd !== null ? newSourceEnd : clip.sourceEnd;

    // Clamp to valid bounds
    const clampedStart = Math.max(0, Math.min(ss, se - 0.1));
    const clampedEnd = Math.min(mediaItem.duration, Math.max(se, clampedStart + 0.1));

    // If trimming from the left, the timeline position shifts accordingly
    const leftDelta = clampedStart - clip.sourceStart;
    const newTimelineStart = clip.timelineStart + leftDelta;

    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                sourceStart: clampedStart,
                sourceEnd: clampedEnd,
                timelineStart: Math.max(0, newTimelineStart),
              }
            : c,
        ),
      })),
      isDirty: true,
    }));
  },

  splitClip: (clipId, atTimelineTime) => {
    const { tracks } = get();
    let clip: Clip | undefined;
    for (const t of tracks) {
      clip = t.clips.find((c) => c.id === clipId);
      if (clip) break;
    }
    if (!clip) return;

    const end = clipEnd(clip);
    // Must split within the clip's range (with a small margin)
    if (atTimelineTime <= clip.timelineStart + 0.05 || atTimelineTime >= end - 0.05)
      return;

    const splitOffset = atTimelineTime - clip.timelineStart;

    const leftClip: Clip = {
      ...clip,
      sourceEnd: clip.sourceStart + splitOffset,
    };

    const rightClip: Clip = {
      id: nanoid(),
      mediaId: clip.mediaId,
      trackId: clip.trackId,
      timelineStart: atTimelineTime,
      sourceStart: clip.sourceStart + splitOffset,
      sourceEnd: clip.sourceEnd,
    };

    get().pushSnapshot();
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === clip!.trackId
          ? {
              ...t,
              clips: sortClips([
                ...t.clips.filter((c) => c.id !== clipId),
                leftClip,
                rightClip,
              ]),
            }
          : t,
      ),
      isDirty: true,
    }));
  },

  deleteClip: (clipId) => {
    get().pushSnapshot();
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      })),
      isDirty: true,
    }));
  },

  // ── Queries ───────────────────────────────────────────────────────────────

  getTimelineEnd: () => {
    const { tracks } = get();
    let end = 0;
    for (const track of tracks) {
      for (const clip of track.clips) {
        end = Math.max(end, clipEnd(clip));
      }
    }
    return end;
  },

  getClipsAtTime: (time) => {
    const { tracks, media } = get();
    const results: { clip: Clip; media: MediaItem }[] = [];
    for (const track of tracks) {
      if (!track.visible && track.kind === "video") continue;
      if (track.muted && track.kind === "audio") continue;
      for (const clip of track.clips) {
        if (time >= clip.timelineStart && time < clipEnd(clip)) {
          const m = media.find((item) => item.id === clip.mediaId);
          if (m) results.push({ clip, media: m });
        }
      }
    }
    return results;
  },

  // ── Project save/load ─────────────────────────────────────────────────────

  loadProject: (data, filePath) => {
    set({
      projectId: data.id,
      projectName: data.name,
      media: data.media,
      tracks: data.tracks,
      projectFps: data.fps,
      projectWidth: data.width,
      projectHeight: data.height,
      undoStack: [],
      redoStack: [],
      filePath,
      isDirty: false,
    });
  },
}));
