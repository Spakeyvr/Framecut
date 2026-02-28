import { useMemo, useRef, useCallback, useEffect } from "react";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { TimeRuler } from "./TimeRuler";
import { TrackLane } from "./TrackLane";

export function TimelinePanel({ style }: { style?: React.CSSProperties }) {
  const tracks = useProjectStore((s) => s.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);

  const videoTracks = useMemo(
    () => tracks.filter((t) => t.kind === "video"),
    [tracks],
  );
  const audioTracks = useMemo(
    () => tracks.filter((t) => t.kind === "audio"),
    [tracks],
  );
  const zoom = useUIStore((s) => s.timelineZoom);
  const setZoom = useUIStore((s) => s.setTimelineZoom);
  const scrollX = useUIStore((s) => s.timelineScrollX);
  const setScrollX = useUIStore((s) => s.setTimelineScrollX);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const setPlayheadTime = useUIStore((s) => s.setPlayheadTime);
  const setSelectedClipId = useUIStore((s) => s.setSelectedClipId);
  const getTimelineEnd = useProjectStore((s) => s.getTimelineEnd);

  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);

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

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const tracksArea = tracksAreaRef.current;
      if (!tracksArea) return;
      const rect = tracksArea.getBoundingClientRect();
      const x = clientX - rect.left + scrollX;
      setPlayheadTime(Math.max(0, x / zoom));
    },
    [zoom, scrollX, setPlayheadTime],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isScrubbingRef.current) return;
      seekFromClientX(e.clientX);
    };

    const stopScrub = () => {
      if (!isScrubbingRef.current) return;
      isScrubbingRef.current = false;
      document.body.style.removeProperty("user-select");
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopScrub);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopScrub);
      document.body.style.removeProperty("user-select");
    };
  }, [seekFromClientX]);

  const playheadX = playheadTime * zoom - scrollX;

  return (
    <div className="timeline-panel" style={style}>
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
          {videoTracks.map((track, i) => (
            <div key={track.id} className="track-header">
              <span className="track-header-name">V{i + 1}</span>
            </div>
          ))}
          {audioTracks.length > 0 && videoTracks.length > 0 && (
            <div className="track-group-divider" />
          )}
          {audioTracks.map((track, i) => (
            <div key={track.id} className="track-header">
              <span className="track-header-name">A{i + 1}</span>
            </div>
          ))}
        </div>

        {/* Tracks area with ruler */}
        <div
          ref={tracksAreaRef}
          className="timeline-tracks-area"
          onWheel={handleWheel}
          onScroll={handleScroll}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            const clickedClip = target.closest(".clip");
            const clickedMenu = target.closest(".context-menu");
            if (clickedClip || clickedMenu) return;

            isScrubbingRef.current = true;
            document.body.style.userSelect = "none";
            seekFromClientX(e.clientX);
            e.preventDefault();
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const clickedClip = target.closest(".clip");
            const clickedMenu = target.closest(".context-menu");
            if (!clickedClip && !clickedMenu) setSelectedClipId(null);
          }}
        >
          <div style={{ width: contentWidth, minWidth: "100%" }}>
            <TimeRuler width={contentWidth} />
            {videoTracks.map((track) => (
              <TrackLane key={track.id} track={track} />
            ))}
            {audioTracks.length > 0 && videoTracks.length > 0 && (
              <div className="track-group-divider" />
            )}
            {audioTracks.map((track) => (
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
