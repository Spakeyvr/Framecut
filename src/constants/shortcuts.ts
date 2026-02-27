export interface ShortcutDefinition {
  id: string;
  keys: string;
  description: string;
}

export const SHORTCUT_BINDINGS = {
  HELP_F1: "F1",
  HELP_QUESTION: "Slash",
  PLAY_PAUSE: "Space",
  DELETE: "Delete",
  BACKSPACE: "Backspace",
  SPLIT: "KeyS",
  UNDO_REDO: "KeyZ",
  SAVE: "KeyS",
  ARROW_LEFT: "ArrowLeft",
  ARROW_RIGHT: "ArrowRight",
  HOME: "Home",
  END: "End",
} as const;

export const SHORTCUTS: ShortcutDefinition[] = [
  { id: "help", keys: "F1 / Shift+/", description: "Open Help" },
  { id: "playPause", keys: "Space", description: "Play/Pause" },
  {
    id: "deleteClip",
    keys: "Delete / Backspace",
    description: "Delete selected clip",
  },
  {
    id: "splitClip",
    keys: "S",
    description: "Split selected clip at playhead",
  },
  { id: "save", keys: "Ctrl/Cmd+S", description: "Save project" },
  { id: "saveAs", keys: "Ctrl/Cmd+Shift+S", description: "Save project as..." },
  { id: "open", keys: "Ctrl/Cmd+O", description: "Open project" },
  { id: "undo", keys: "Ctrl/Cmd+Z", description: "Undo" },
  { id: "redo", keys: "Ctrl/Cmd+Shift+Z", description: "Redo" },
  { id: "stepBack", keys: "Left Arrow", description: "Step playhead back 1 frame" },
  {
    id: "stepBackBig",
    keys: "Shift+Left Arrow",
    description: "Step playhead back 1 second",
  },
  {
    id: "stepForward",
    keys: "Right Arrow",
    description: "Step playhead forward 1 frame",
  },
  {
    id: "stepForwardBig",
    keys: "Shift+Right Arrow",
    description: "Step playhead forward 1 second",
  },
  { id: "start", keys: "Home", description: "Go to timeline start" },
  { id: "end", keys: "End", description: "Go to timeline end" },
];
