import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { MediaPool } from "../media-pool/MediaPool";

function ToolboxContent() {
  const tracks = useProjectStore((s) => s.tracks);
  const addTextClip = useProjectStore((s) => s.addTextClip);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const setSelectedClipId = useUIStore((s) => s.setSelectedClipId);

  const handleAddText = () => {
    const videoTrack = tracks.find((t) => t.kind === "video");
    if (!videoTrack) return;
    const clipId = addTextClip(videoTrack.id, playheadTime);
    if (clipId) {
      setSelectedClipId(clipId);
    }
  };

  return (
    <div className="toolbox-grid">
      <button className="toolbox-card" onClick={handleAddText}>
        <span className="toolbox-card-icon">T</span>
        <span className="toolbox-card-label">Text</span>
      </button>
      <button className="toolbox-card toolbox-card--disabled" disabled>
        <span className="toolbox-card-icon">&#x25A1;</span>
        <span className="toolbox-card-label">Shapes</span>
        <span className="toolbox-card-badge">Coming Soon</span>
      </button>
      <button className="toolbox-card toolbox-card--disabled" disabled>
        <span className="toolbox-card-icon">&#x21C4;</span>
        <span className="toolbox-card-label">Transitions</span>
        <span className="toolbox-card-badge">Coming Soon</span>
      </button>
      <button className="toolbox-card toolbox-card--disabled" disabled>
        <span className="toolbox-card-icon">&#x2261;</span>
        <span className="toolbox-card-label">Captions</span>
        <span className="toolbox-card-badge">Coming Soon</span>
      </button>
    </div>
  );
}

export function LeftPanel() {
  const leftPanelTab = useUIStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab);

  return (
    <div className="panel media-pool left-panel">
      <div className="left-panel-tabs">
        <button
          className={`left-panel-tab ${leftPanelTab === "media" ? "left-panel-tab--active" : ""}`}
          onClick={() => setLeftPanelTab("media")}
        >
          Media
        </button>
        <button
          className={`left-panel-tab ${leftPanelTab === "toolbox" ? "left-panel-tab--active" : ""}`}
          onClick={() => setLeftPanelTab("toolbox")}
        >
          Toolbox
        </button>
      </div>
      {leftPanelTab === "media" ? <MediaPool /> : <ToolboxContent />}
    </div>
  );
}
