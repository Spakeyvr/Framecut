import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { seekPreview } from "../../api/commands";

const PREVIEW_FPS = 30;
const FRAME_BUDGET_MS = 1000 / PREVIEW_FPS;
const PLAYHEAD_UI_SYNC_MS = 100;

const PREVIEW_TIERS = [
  { id: 0, width: 640, height: 360, label: "640x360" },
  { id: 1, width: 480, height: 270, label: "480x270" },
  { id: 2, width: 320, height: 180, label: "320x180" },
] as const;

type PreviewTierIndex = 0 | 1 | 2;

type PreviewMediaType = "video" | "audio" | "image";

interface NativeClipRef {
  key: string;
  mediaPath: string;
  mediaType: PreviewMediaType;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  timelineEnd: number;
}

interface PendingSeek {
  token: number;
  time: number;
  width: number;
  height: number;
  tier: PreviewTierIndex;
}

interface PreviewStatsPayload {
  fpsDelivered: number;
  spawnMsAvg: number;
  decodeMsAvg: number;
  totalMsAvg: number;
  tier: number;
}

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * PREVIEW_FPS);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}

function waitForEvent(target: EventTarget, eventName: string, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const done = (cb: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      target.removeEventListener(eventName, onEvent);
      cb();
    };

    const onEvent = () => done(resolve);
    const timer = window.setTimeout(() => done(() => reject(new Error(`${eventName} timeout`))), timeoutMs);

    target.addEventListener(eventName, onEvent, { once: true });
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getSourceDimensions(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  if (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) {
    return { width: source.width, height: source.height };
  }
  if (typeof VideoFrame !== "undefined" && source instanceof VideoFrame) {
    return { width: source.displayWidth, height: source.displayHeight };
  }
  return { width: 0, height: 0 };
}

function isJpegBytes(data: Uint8Array): boolean {
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8;
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

  const [previewTier, setPreviewTier] = useState<PreviewTierIndex>(0);
  const [debugStats, setDebugStats] = useState<PreviewStatsPayload | null>(null);

  const playingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const seekInFlightRef = useRef(false);
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  const latestSeekTokenRef = useRef(0);
  const activeTierRef = useRef<PreviewTierIndex>(0);
  const overloadSinceRef = useRef<number | null>(null);

  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const nativeVideoPathRef = useRef<string>("");
  const nativeClipKeyRef = useRef<string | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const activeTier = PREVIEW_TIERS[previewTier];

  useEffect(() => {
    activeTierRef.current = previewTier;
  }, [previewTier]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const { clipsJson, nativeClips } = useMemo(() => {
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const refs: {
      media_path: string;
      source_start: number;
      source_end: number;
      timeline_start: number;
    }[] = [];
    const nativeRefs: NativeClipRef[] = [];

    for (const track of tracks) {
      if (track.kind === "video" && !track.visible) continue;
      for (const clip of track.clips) {
        const mediaItem = mediaById.get(clip.mediaId);
        if (!mediaItem) continue;

        refs.push({
          media_path: mediaItem.path,
          source_start: clip.sourceStart,
          source_end: clip.sourceEnd,
          timeline_start: clip.timelineStart,
        });

        const duration = clip.sourceEnd - clip.sourceStart;
        nativeRefs.push({
          key: `${mediaItem.path}|${clip.timelineStart.toFixed(6)}|${clip.sourceStart.toFixed(6)}|${clip.sourceEnd.toFixed(6)}`,
          mediaPath: mediaItem.path,
          mediaType: mediaItem.type as PreviewMediaType,
          sourceStart: clip.sourceStart,
          sourceEnd: clip.sourceEnd,
          timelineStart: clip.timelineStart,
          timelineEnd: clip.timelineStart + duration,
        });
      }
    }

    return {
      clipsJson: refs.length > 0 ? JSON.stringify(refs) : "",
      nativeClips: nativeRefs,
    };
  }, [tracks, media]);

  const findActiveClip = useCallback(
    (time: number) => {
      let audioFallback: NativeClipRef | null = null;
      for (const clip of nativeClips) {
        if (time >= clip.timelineStart && time < clip.timelineEnd) {
          if (clip.mediaType !== "audio") {
            return clip;
          }
          if (!audioFallback) {
            audioFallback = clip;
          }
        }
      }
      return audioFallback;
    },
    [nativeClips],
  );

  const getNativeVideo = useCallback(() => {
    if (!nativeVideoRef.current) {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      nativeVideoRef.current = video;
    }
    return nativeVideoRef.current;
  }, []);

  const clearCanvas = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
  }, []);

  const drawCanvasSource = useCallback(
    (source: CanvasImageSource, width: number, height: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const { width: sourceWidth, height: sourceHeight } = getSourceDimensions(source);

      if (!sourceWidth || !sourceHeight) {
        clearCanvas(width, height);
        return false;
      }

      const scale = Math.min(width / sourceWidth, height / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const offsetX = (width - drawWidth) / 2;
      const offsetY = (height - drawHeight) / 2;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      try {
        ctx.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);
      } catch {
        clearCanvas(width, height);
        return false;
      }
      return true;
    },
    [clearCanvas],
  );

  const drawRawFrame = useCallback(
    (data: Uint8Array, width: number, height: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (data.length !== width * height * 4) {
        clearCanvas(width, height);
        return;
      }

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const clamped = new Uint8ClampedArray(data);
      const imageData = new ImageData(clamped, width, height);
      ctx.putImageData(imageData, 0, 0);
    },
    [clearCanvas],
  );

  const drawBitmapFrame = useCallback(
    async (data: Uint8Array, width: number, height: number) => {
      if (!isJpegBytes(data)) {
        drawRawFrame(data, width, height);
        return;
      }

      const bytes = new Uint8Array(data.byteLength);
      bytes.set(data);
      const blob = new Blob([bytes], { type: "image/jpeg" });
      if (typeof createImageBitmap !== "function") {
        const url = URL.createObjectURL(blob);
        try {
          const img = new Image();
          img.src = url;
          await waitForEvent(img, "load");
          drawCanvasSource(img, width, height);
        } catch {
          clearCanvas(width, height);
        } finally {
          URL.revokeObjectURL(url);
        }
        return;
      }

      let bitmap: ImageBitmap | null = null;
      try {
        bitmap = await createImageBitmap(blob);
        drawCanvasSource(bitmap, width, height);
      } catch {
        clearCanvas(width, height);
      } finally {
        bitmap?.close();
      }
    },
    [clearCanvas, drawCanvasSource, drawRawFrame],
  );

  const loadImage = useCallback(async (path: string) => {
    const cache = imageCacheRef.current;
    const existing = cache.get(path);
    if (existing) {
      if (existing.complete) return existing;
      await waitForEvent(existing, "load");
      return existing;
    }

    const img = new Image();
    img.src = convertFileSrc(path);
    cache.set(path, img);
    await waitForEvent(img, "load");
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error("Image failed to decode");
    }
    return img;
  }, []);

  const syncVideoToClip = useCallback(
    async (clip: NativeClipRef, sourceTime: number, forPlayback: boolean) => {
      const video = getNativeVideo();
      if (nativeVideoPathRef.current !== clip.mediaPath) {
        video.pause();
        nativeClipKeyRef.current = null;
        nativeVideoPathRef.current = clip.mediaPath;
        video.src = convertFileSrc(clip.mediaPath);
        video.load();
        await waitForEvent(video, "loadedmetadata", 3000).catch(() => undefined);
      }

      if (!video.videoWidth || !video.videoHeight || video.readyState === 0) {
        throw new Error("Video metadata unavailable");
      }

      const hasDuration = Number.isFinite(video.duration) && video.duration > 0;
      const targetTime = hasDuration ? clamp(sourceTime, 0, Math.max(video.duration - 0.001, 0)) : Math.max(sourceTime, 0);

      const clipChanged = nativeClipKeyRef.current !== clip.key;
      const drift = Math.abs(video.currentTime - targetTime);
      const driftThreshold = forPlayback ? 0.75 : 0.05;
      const needSeek = !forPlayback || clipChanged || drift > driftThreshold;

      if (needSeek) {
        video.currentTime = targetTime;
        await waitForEvent(video, "seeked", 800).catch(() => undefined);
      }

      if (video.readyState < 2) {
        await waitForEvent(video, "loadeddata", 800).catch(() => undefined);
      }
      if (!video.videoWidth || !video.videoHeight) {
        throw new Error("Video frame unavailable");
      }

      if (forPlayback) {
        if (video.paused) {
          await video.play().catch(() => undefined);
        }
      } else {
        video.pause();
      }

      nativeClipKeyRef.current = clip.key;
      return video;
    },
    [getNativeVideo],
  );

  const tryDrawNative = useCallback(
    async (request: PendingSeek) => {
      const clip = findActiveClip(request.time);
      if (!clip) {
        nativeClipKeyRef.current = null;
        nativeVideoRef.current?.pause();
        clearCanvas(request.width, request.height);
        return true;
      }

      const sourceTime = clip.sourceStart + (request.time - clip.timelineStart);

      if (clip.mediaType === "image") {
        nativeClipKeyRef.current = null;
        nativeVideoRef.current?.pause();
        let image: HTMLImageElement;
        try {
          image = await loadImage(clip.mediaPath);
        } catch {
          return false;
        }
        return drawCanvasSource(image, request.width, request.height);
      }

      if (clip.mediaType === "audio") {
        nativeClipKeyRef.current = null;
        nativeVideoRef.current?.pause();
        clearCanvas(request.width, request.height);
        return true;
      }

      try {
        const video = await syncVideoToClip(clip, sourceTime, isPlayingRef.current);
        return drawCanvasSource(video, request.width, request.height);
      } catch (err) {
        console.warn("[Preview] native video failed, falling back to FFmpeg:", err);
        return false;
      }
    },
    [clearCanvas, drawCanvasSource, findActiveClip, loadImage, syncVideoToClip],
  );

  const doSeek = useCallback(
    async (request: PendingSeek) => {
      let nativeHandled = false;
      try {
        nativeHandled = await tryDrawNative(request);
      } catch (err) {
        console.warn("[Preview] tryDrawNative threw:", err);
        nativeHandled = false;
      }
      if (!nativeHandled) {
        console.debug("[Preview] native path returned false, using FFmpeg fallback");
      }
      if (nativeHandled) return;

      if (!clipsJson) {
        clearCanvas(request.width, request.height);
        return;
      }

      try {
        const frameData = await seekPreview(
          clipsJson,
          request.time,
          request.width,
          request.height,
          request.tier,
        );

        await drawBitmapFrame(frameData, request.width, request.height);
      } catch {
        clearCanvas(request.width, request.height);
      }
    },
    [clipsJson, clearCanvas, drawBitmapFrame, tryDrawNative],
  );

  const queueSeek = useCallback(
    (time: number, tierOverride?: PreviewTierIndex) => {
      const tier = tierOverride ?? activeTierRef.current;
      const tierDef = PREVIEW_TIERS[tier];
      const token = latestSeekTokenRef.current + 1;
      latestSeekTokenRef.current = token;

      pendingSeekRef.current = {
        token,
        time,
        width: tierDef.width,
        height: tierDef.height,
        tier,
      };

      if (seekInFlightRef.current) return;

      seekInFlightRef.current = true;
      void (async () => {
        while (pendingSeekRef.current) {
          const next = pendingSeekRef.current;
          pendingSeekRef.current = null;
          try {
            await doSeek(next);
          } catch {
            clearCanvas(next.width, next.height);
          }
        }
        seekInFlightRef.current = false;
      })();
    },
    [clearCanvas, doSeek],
  );

  useEffect(() => {
    if (!isPlaying) {
      queueSeek(playheadTime, previewTier);
    }
  }, [playheadTime, isPlaying, previewTier, queueSeek]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const unlisten = listen<PreviewStatsPayload>("preview-stats", (event) => {
      setDebugStats(event.payload);

      if (!isPlayingRef.current) {
        overloadSinceRef.current = null;
        return;
      }

      if (event.payload.totalMsAvg > FRAME_BUDGET_MS) {
        const now = performance.now();
        if (overloadSinceRef.current === null) {
          overloadSinceRef.current = now;
          return;
        }

        if (now - overloadSinceRef.current >= 1000) {
          if (activeTierRef.current < PREVIEW_TIERS.length - 1) {
            const nextTier = (activeTierRef.current + 1) as PreviewTierIndex;
            setPreviewTier(nextTier);
            activeTierRef.current = nextTier;
            queueSeek(useUIStore.getState().playheadTime, nextTier);
          }
          overloadSinceRef.current = null;
        }
      } else {
        overloadSinceRef.current = null;
      }
    });

    return () => {
      unlisten.then((off) => off());
    };
  }, [queueSeek]);

  useEffect(() => {
    playingRef.current = isPlaying;
    if (!isPlaying) {
      overloadSinceRef.current = null;
      nativeVideoRef.current?.pause();
      if (previewTier !== 0) {
        setPreviewTier(0);
        activeTierRef.current = 0;
      }
      return;
    }

    let animFrameId: number;
    const playbackStartAt = performance.now();
    const playbackStartTime = useUIStore.getState().playheadTime;
    let lastTs = playbackStartAt;
    let lastUiSyncTs = playbackStartAt;
    let playbackTime = playbackStartTime;
    const frameDuration = 1000 / PREVIEW_FPS;
    const end = getTimelineEnd();

    const tick = (now: number) => {
      if (!playingRef.current) return;

      const elapsed = now - lastTs;
      if (elapsed >= frameDuration) {
        lastTs = now;
        const nextTime = playbackStartTime + (now - playbackStartAt) / 1000;
        playbackTime = nextTime;

        if (nextTime >= end) {
          setIsPlaying(false);
          setPlayheadTime(end);
          return;
        }

        queueSeek(nextTime);
        if (now - lastUiSyncTs >= PLAYHEAD_UI_SYNC_MS) {
          lastUiSyncTs = now;
          setPlayheadTime(nextTime);
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => {
      pendingSeekRef.current = null;
      setPlayheadTime(playbackTime);
      cancelAnimationFrame(animFrameId);
    };
  }, [isPlaying, previewTier, queueSeek, getTimelineEnd, setIsPlaying, setPlayheadTime]);

  useEffect(() => {
    clearCanvas(activeTier.width, activeTier.height);
  }, [activeTier.width, activeTier.height, clearCanvas]);

  useEffect(
    () => () => {
      nativeVideoRef.current?.pause();
      nativeVideoRef.current = null;
      imageCacheRef.current.clear();
    },
    [],
  );

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (playheadTime >= getTimelineEnd() && getTimelineEnd() > 0) {
        setPlayheadTime(0);
      }
      setIsPlaying(true);
    }
  };

  return (
    <div className="panel preview-panel">
      <div className="preview-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={activeTier.width}
          height={activeTier.height}
        />
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
        {import.meta.env.DEV && debugStats && (
          <span className="preview-debug">
            {`${activeTier.label} | ${debugStats.fpsDelivered.toFixed(1)} fps | spawn ${debugStats.spawnMsAvg.toFixed(1)}ms | decode ${debugStats.decodeMsAvg.toFixed(1)}ms | total ${debugStats.totalMsAvg.toFixed(1)}ms`}
          </span>
        )}
      </div>
    </div>
  );
}
