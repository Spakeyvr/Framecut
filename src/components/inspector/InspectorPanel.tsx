import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { clipDuration } from "../../types";

export function InspectorPanel() {
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const tracks = useProjectStore((s) => s.tracks);
  const media = useProjectStore((s) => s.media);

  let selectedClip = null;
  let selectedMedia = null;

  if (selectedClipId) {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) {
        selectedClip = clip;
        selectedMedia = media.find((m) => m.id === clip.mediaId);
        break;
      }
    }
  }

  return (
    <div className="panel inspector-panel">
      <div className="panel-header">
        <span>Inspector</span>
      </div>
      <div className="panel-body">
        {!selectedClip || !selectedMedia ? (
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
