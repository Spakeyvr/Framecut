import { useRef, useCallback } from "react";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { TimeRuler } from "./TimeRuler";
import { TrackLane } from "./TrackLane";

export function TimelinePanel() {
  const tracks = useProjectStore((s) => s.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);
  const zoom = useUIStore((s) => s.timelineZoom);
  const setZoom = useUIStore((s) => s.setTimelineZoom);
  const scrollX = useUIStore((s) => s.timelineScrollX);
  const setScrollX = useUIStore((s) => s.setTimelineScrollX);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const setSelectedClipId = useUIStore((s) => s.setSelectedClipId);
  const getTimelineEnd = useProjectStore((s) => s.getTimelineEnd);

  const tracksAreaRef = useRef<HTMLDivElement>(null);

  // Total content width = max of (timeline end + 30s buffer) * zoom, or viewport width
  const contentWidth = Math.max((getTimelineEnd() + 30) * zoom, 2000);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setZoom(zoom + delta);
      } else {
        // Horizontal scroll
        setScrollX(scrollX + e.deltaX + e.deltaY);
      }
    },
    [zoom, scrollX, setZoom, setScrollX],
  );

  const handleScroll = useCallback(() => {
    if (!tracksAreaRef.current) return;
    setScrollX(tracksAreaRef.current.scrollLeft);
  }, [setScrollX]);

  const playheadX = playheadTime * zoom - scrollX;

  return (
    <div className="timeline-panel">
      {/* Timeline toolbar */}
      <div className="timeline-toolbar">
        <button
          className="toolbar-btn"
          onClick={() => addTrack("video")}
          title="Add video track"
        >
          + Video
        </button>
        <button
          className="toolbar-btn"
          onClick={() => addTrack("audio")}
          title="Add audio track"
        >
          + Audio
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--text-muted)", fontSize: 10 }}>Zoom</span>
        <input
          className="zoom-slider"
          type="range"
          min={10}
          max={500}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </div>

      {/* Timeline body */}
      <div className="timeline-body">
        {/* Track headers */}
        <div className="timeline-track-headers">
          {tracks.map((track, i) => (
            <div key={track.id} className="track-header">
              <span className="track-header-name">
                {track.kind === "video" ? "V" : "A"}
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* Tracks area with ruler */}
        <div
          ref={tracksAreaRef}
          className="timeline-tracks-area"
          onWheel={handleWheel}
          onScroll={handleScroll}
          onClick={(e) => {
            // Click on empty area deselects
            if (e.target === e.currentTarget) {
              setSelectedClipId(null);
            }
          }}
        >
          <div style={{ width: contentWidth, minWidth: "100%" }}>
            <TimeRuler width={contentWidth} />
            {tracks.map((track) => (
              <TrackLane key={track.id} track={track} />
            ))}
          </div>

          {/* Playhead */}
          {playheadX >= 0 && (
            <>
              <div className="playhead-head" style={{ left: playheadX - 5 }} />
              <div className="playhead-line" style={{ left: playheadX }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
