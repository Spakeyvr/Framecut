import { useRef, useEffect, useCallback } from "react";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { seekPreview } from "../../api/commands";
import type { ClipRef } from "../../types";

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 360;
const PREVIEW_FPS = 24;

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}

export function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const isPlaying = useUIStore((s) => s.isPlaying);
  const setIsPlaying = useUIStore((s) => s.setIsPlaying);
  const setPlayheadTime = useUIStore((s) => s.setPlayheadTime);
  const tracks = useProjectStore((s) => s.tracks);
  const media = useProjectStore((s) => s.media);
  const getTimelineEnd = useProjectStore((s) => s.getTimelineEnd);

  const playingRef = useRef(false);

  // Build ClipRef list for Rust
  const buildClipRefs = useCallback((): ClipRef[] => {
    const refs: ClipRef[] = [];
    for (const track of tracks) {
      if (track.kind === "video" && !track.visible) continue;
      for (const clip of track.clips) {
        const m = media.find((item) => item.id === clip.mediaId);
        if (m) {
          refs.push({
            mediaPath: m.path,
            sourceStart: clip.sourceStart,
            sourceEnd: clip.sourceEnd,
            timelineStart: clip.timelineStart,
          });
        }
      }
    }
    return refs;
  }, [tracks, media]);

  // Draw RGBA frame data to canvas
  const drawFrame = useCallback((data: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (data.length === PREVIEW_WIDTH * PREVIEW_HEIGHT * 4) {
      const imageData = new ImageData(
        new Uint8ClampedArray(data),
        PREVIEW_WIDTH,
        PREVIEW_HEIGHT,
      );
      ctx.putImageData(imageData, 0, 0);
    } else {
      // Wrong size or empty — black frame
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    }
  }, []);

  // Seek: decode frame at current playhead position
  const doSeek = useCallback(
    async (time: number) => {
      const clipRefs = buildClipRefs();
      if (clipRefs.length === 0) {
        drawFrame([]);
        return;
      }
      try {
        const clipsJson = JSON.stringify(
          clipRefs.map((c) => ({
            media_path: c.mediaPath,
            source_start: c.sourceStart,
            source_end: c.sourceEnd,
            timeline_start: c.timelineStart,
          })),
        );
        const frameData = await seekPreview(
          clipsJson,
          time,
          PREVIEW_WIDTH,
          PREVIEW_HEIGHT,
        );
        drawFrame(frameData);
      } catch {
        drawFrame([]);
      }
    },
    [buildClipRefs, drawFrame],
  );

  // Seek on playhead change (when not playing)
  useEffect(() => {
    if (!isPlaying) {
      doSeek(playheadTime);
    }
  }, [playheadTime, isPlaying, doSeek]);

  // Playback loop
  useEffect(() => {
    playingRef.current = isPlaying;
    if (!isPlaying) return;

    let animFrameId: number;
    let lastTs = performance.now();
    const frameDuration = 1000 / PREVIEW_FPS;
    const end = getTimelineEnd();

    const tick = async (now: number) => {
      if (!playingRef.current) return;

      const elapsed = now - lastTs;
      if (elapsed >= frameDuration) {
        lastTs = now;
        const currentTime = useUIStore.getState().playheadTime;
        const nextTime = currentTime + elapsed / 1000;

        if (nextTime >= end) {
          setIsPlaying(false);
          setPlayheadTime(end);
          return;
        }

        setPlayheadTime(nextTime);
        await doSeek(nextTime);
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [isPlaying, doSeek, getTimelineEnd, setIsPlaying, setPlayheadTime]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // If at the end, restart from beginning
      if (playheadTime >= getTimelineEnd() && getTimelineEnd() > 0) {
        setPlayheadTime(0);
      }
      setIsPlaying(true);
    }
  };

  return (
    <div className="panel preview-panel">
      <div className="preview-canvas-wrap">
        <canvas ref={canvasRef} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} />
      </div>
      <div className="preview-transport">
        <button
          className="transport-btn"
          onClick={() => {
            setIsPlaying(false);
            setPlayheadTime(0);
          }}
          title="Go to start"
        >
          &#x23EE;
        </button>
        <button
          className="transport-btn transport-btn--play"
          onClick={togglePlay}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? "\u23F8" : "\u25B6"}
        </button>
        <button
          className="transport-btn"
          onClick={() => {
            setIsPlaying(false);
            setPlayheadTime(getTimelineEnd());
          }}
          title="Go to end"
        >
          &#x23ED;
        </button>
        <span className="transport-time">{formatTimecode(playheadTime)}</span>
      </div>
    </div>
  );
}
