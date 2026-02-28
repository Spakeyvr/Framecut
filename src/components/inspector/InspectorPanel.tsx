import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { clipDuration, isTextClip, TEXT_FONT_OPTIONS } from "../../types";
import type { Clip, TextProperties } from "../../types";

function TextInspector({
  clip,
  onUpdate,
}: {
  clip: Clip;
  onUpdate: (clipId: string, updates: Partial<TextProperties>) => void;
}) {
  const tp = clip.textProperties!;

  return (
    <div className="inspector-text">
      <div className="inspector-field">
        <label>Text</label>
        <input
          type="text"
          value={tp.content}
          onChange={(e) => onUpdate(clip.id, { content: e.target.value })}
          className="inspector-text-input"
        />
      </div>
      <div className="inspector-field">
        <label>Font</label>
        <select
          value={tp.fontFamily}
          onChange={(e) => onUpdate(clip.id, { fontFamily: e.target.value })}
        >
          {TEXT_FONT_OPTIONS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </div>
      <div className="inspector-field">
        <label>Size</label>
        <input
          type="number"
          value={tp.fontSize}
          min={8}
          max={200}
          onChange={(e) => onUpdate(clip.id, { fontSize: Number(e.target.value) })}
        />
      </div>
      <div className="inspector-field">
        <label>Color</label>
        <input
          type="color"
          value={tp.color}
          onChange={(e) => onUpdate(clip.id, { color: e.target.value })}
          className="inspector-color-input"
        />
      </div>
      <div className="inspector-field">
        <label>Position X</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={tp.x}
          onChange={(e) => onUpdate(clip.id, { x: Number(e.target.value) })}
        />
      </div>
      <div className="inspector-field">
        <label>Position Y</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={tp.y}
          onChange={(e) => onUpdate(clip.id, { y: Number(e.target.value) })}
        />
      </div>
      <div className="inspector-field">
        <label>Duration</label>
        <span>{clipDuration(clip).toFixed(2)}s</span>
      </div>
      <div className="inspector-field">
        <label>Start</label>
        <span>{clip.timelineStart.toFixed(2)}s</span>
      </div>
    </div>
  );
}

export function InspectorPanel() {
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const tracks = useProjectStore((s) => s.tracks);
  const media = useProjectStore((s) => s.media);
  const updateTextProperties = useProjectStore((s) => s.updateTextProperties);

  let selectedClip: Clip | null = null;
  let selectedMedia = null;

  if (selectedClipId) {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) {
        selectedClip = clip;
        selectedMedia = media.find((m) => m.id === clip.mediaId) ?? null;
        break;
      }
    }
  }

  const isText = selectedClip && isTextClip(selectedClip);

  return (
    <div className="panel inspector-panel">
      <div className="panel-header">
        <span>Inspector</span>
      </div>
      <div className="panel-body">
        {!selectedClip ? (
          <div className="inspector-empty">Select a clip to inspect</div>
        ) : isText ? (
          <TextInspector clip={selectedClip} onUpdate={updateTextProperties} />
        ) : !selectedMedia ? (
          <div className="inspector-empty">Select a clip to inspect</div>
        ) : (
          <div>
            <div className="inspector-field">
              <label>Name</label>
              <span>{selectedMedia.name}</span>
            </div>
            <div className="inspector-field">
              <label>Duration</label>
              <span>{clipDuration(selectedClip).toFixed(2)}s</span>
            </div>
            <div className="inspector-field">
              <label>Start</label>
              <span>{selectedClip.timelineStart.toFixed(2)}s</span>
            </div>
            <div className="inspector-field">
              <label>Source In</label>
              <span>{selectedClip.sourceStart.toFixed(2)}s</span>
            </div>
            <div className="inspector-field">
              <label>Source Out</label>
              <span>{selectedClip.sourceEnd.toFixed(2)}s</span>
            </div>
            <div className="inspector-field">
              <label>Resolution</label>
              <span>
                {selectedMedia.width}x{selectedMedia.height}
              </span>
            </div>
            <div className="inspector-field">
              <label>FPS</label>
              <span>{selectedMedia.fps}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
