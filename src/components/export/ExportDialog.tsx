import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { startExport, cancelExport } from "../../api/commands";
import {
  EXPORT_PRESETS,
  RESOLUTIONS,
  CODECS,
  FORMATS,
  QUALITY_LEVELS,
  FRAME_RATES,
  getCrfForCodec,
} from "../../types";
import type { ClipRef, ExportFormat } from "../../types";

const DEFAULT_PRESET = EXPORT_PRESETS[0];

export function ExportDialog() {
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);
  const tracks = useProjectStore((s) => s.tracks);
  const media = useProjectStore((s) => s.media);
  const projectFps = useProjectStore((s) => s.projectFps);

  // Detect the max FPS from video clips on the timeline
  const detectedFps = (() => {
    let maxFps = 0;
    for (const track of tracks) {
      for (const clip of track.clips) {
        const m = media.find((item) => item.id === clip.mediaId);
        if (m && m.type === "video" && m.fps > maxFps) {
          maxFps = m.fps;
        }
      }
    }
    return maxFps > 0 ? maxFps : projectFps;
  })();

  // Find the closest standard frame rate, or use the exact value
  const defaultFps = FRAME_RATES.find((fr) => fr.value === Math.round(detectedFps))?.value
    ?? Math.round(detectedFps);

  // Preset & individual settings state
  const [selectedPresetId, setSelectedPresetId] = useState<string | "custom">(
    DEFAULT_PRESET.id,
  );
  const [format, setFormat] = useState<ExportFormat>(DEFAULT_PRESET.format);
  const [resolutionIndex, setResolutionIndex] = useState(
    RESOLUTIONS.findIndex(
      (r) => r.width === DEFAULT_PRESET.width && r.height === DEFAULT_PRESET.height,
    ),
  );
  const [codecId, setCodecId] = useState(DEFAULT_PRESET.codec);
  const [qualityIndex, setQualityIndex] = useState(1); // "High"
  const [fps, setFps] = useState(defaultFps);

  // Export progress state
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const exportingRef = useRef(false);

  // Derived values
  const formatDef = FORMATS.find((f) => f.id === format)!;
  const availableCodecs = CODECS.filter((c) =>
    (c.formats as readonly string[]).includes(format),
  );
  const resolution = RESOLUTIONS[resolutionIndex];

  // ── Preset handler ──────────────────────────────────────────────────────────

  const handlePresetChange = (presetId: string) => {
    if (presetId === "custom") {
      setSelectedPresetId("custom");
      return;
    }
    const preset = EXPORT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setSelectedPresetId(presetId);
    setFormat(preset.format);
    setCodecId(preset.codec);

    const resIdx = RESOLUTIONS.findIndex(
      (r) => r.width === preset.width && r.height === preset.height,
    );
    if (resIdx >= 0) setResolutionIndex(resIdx);

    // Find the closest quality level for this codec/crf
    const crfs = QUALITY_LEVELS.map((_q, i) => ({
      i,
      diff: Math.abs(getCrfForCodec(i, preset.codec) - preset.crf),
    }));
    crfs.sort((a, b) => a.diff - b.diff);
    setQualityIndex(crfs[0].i);
  };

  // ── Individual field handlers ───────────────────────────────────────────────

  const handleFormatChange = (newFormat: ExportFormat) => {
    setFormat(newFormat);
    setSelectedPresetId("custom");
    const fmtDef = FORMATS.find((f) => f.id === newFormat);
    if (fmtDef && !(fmtDef.codecs as readonly string[]).includes(codecId)) {
      setCodecId(fmtDef.codecs[0]);
    }
  };

  const handleCodecChange = (newCodec: string) => {
    setCodecId(newCodec);
    setSelectedPresetId("custom");
  };

  const handleResolutionChange = (index: number) => {
    setResolutionIndex(index);
    setSelectedPresetId("custom");
  };

  const handleQualityChange = (index: number) => {
    setQualityIndex(index);
    setSelectedPresetId("custom");
  };

  const handleFpsChange = (value: number) => {
    setFps(value);
    setSelectedPresetId("custom");
  };

  // ── Event listeners ─────────────────────────────────────────────────────────

  useEffect(() => {
    currentJobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    exportingRef.current = exporting;
  }, [exporting]);

  useEffect(() => {
    const resolveActiveJob = (incomingJobId: string): string | null => {
      if (!currentJobIdRef.current) {
        if (!exportingRef.current) return null;
        currentJobIdRef.current = incomingJobId;
        setJobId(incomingJobId);
      }
      return currentJobIdRef.current;
    };

    const unlisten1 = listen<{ jobId: string; progress: number }>(
      "export-progress",
      (event) => {
        const activeJob = resolveActiveJob(event.payload.jobId);
        if (!activeJob || event.payload.jobId !== activeJob) return;
        setProgress(event.payload.progress);
      },
    );

    const unlisten2 = listen<{ jobId: string }>("export-done", (event) => {
      const activeJob = resolveActiveJob(event.payload.jobId);
      if (!activeJob || event.payload.jobId !== activeJob) return;
      setExporting(false);
      setProgress(1);
    });

    const unlisten3 = listen<{ jobId: string; error: string }>(
      "export-error",
      (event) => {
        const activeJob = resolveActiveJob(event.payload.jobId);
        if (!activeJob || event.payload.jobId !== activeJob) return;
        setError(event.payload.error);
        setExporting(false);
      },
    );

    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
      unlisten3.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape" && !exporting) {
        e.preventDefault();
        setShowExportDialog(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exporting, setShowExportDialog]);

  // ── Export action ───────────────────────────────────────────────────────────

  const handleExport = async () => {
    setError(null);

    const clipRefs: ClipRef[] = [];
    for (const track of tracks) {
      for (const clip of track.clips) {
        const m = media.find((item) => item.id === clip.mediaId);
        if (m) {
          clipRefs.push({
            mediaPath: m.path,
            sourceStart: clip.sourceStart,
            sourceEnd: clip.sourceEnd,
            timelineStart: clip.timelineStart,
            hasAudio: m.hasAudio,
          });
        }
      }
    }

    if (clipRefs.length === 0) {
      setError("No clips on timeline to export");
      return;
    }

    const outputPath = await save({
      filters: [{ name: formatDef.label, extensions: [formatDef.extension] }],
      defaultPath: `output.${formatDef.extension}`,
    });
    if (!outputPath) return;

    setExporting(true);
    setProgress(0);
    setJobId(null);
    currentJobIdRef.current = null;

    const crf = getCrfForCodec(qualityIndex, codecId);
    const audioBitrate = format === "webm" ? "128k" : "192k";

    try {
      const id = await startExport({
        clips: clipRefs,
        outputPath,
        width: resolution.width,
        height: resolution.height,
        fps,
        codec: codecId,
        crf,
        audioBitrate,
        format,
      });
      if (!currentJobIdRef.current || currentJobIdRef.current === id) {
        setJobId(id);
        currentJobIdRef.current = id;
      }
    } catch (err) {
      setError(String(err));
      setExporting(false);
    }
  };

  const handleCancel = async () => {
    if (jobId && exporting) {
      await cancelExport(jobId);
    }
    setShowExportDialog(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !exporting) {
          setShowExportDialog(false);
        }
      }}
    >
      <div
        className="modal-dialog export-dialog"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>Export Video</h2>
        </div>

        {/* Preset quick-pick */}
        <div className="export-field">
          <label>Preset</label>
          <select
            value={selectedPresetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            disabled={exporting}
          >
            {EXPORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="export-separator" />

        {/* Format & Resolution side by side */}
        <div className="export-fields-row">
          <div className="export-field">
            <label>Format</label>
            <select
              value={format}
              onChange={(e) => handleFormatChange(e.target.value as ExportFormat)}
              disabled={exporting}
            >
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="export-field">
            <label>Resolution</label>
            <select
              value={resolutionIndex}
              onChange={(e) => handleResolutionChange(Number(e.target.value))}
              disabled={exporting}
            >
              {RESOLUTIONS.map((r, i) => (
                <option key={i} value={i}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Codec & Quality side by side */}
        <div className="export-fields-row">
          <div className="export-field">
            <label>Codec</label>
            <select
              value={codecId}
              onChange={(e) => handleCodecChange(e.target.value)}
              disabled={exporting}
            >
              {availableCodecs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="export-field">
            <label>Quality</label>
            <select
              value={qualityIndex}
              onChange={(e) => handleQualityChange(Number(e.target.value))}
              disabled={exporting}
            >
              {QUALITY_LEVELS.map((q, i) => (
                <option key={i} value={i}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Frame Rate */}
        <div className="export-field">
          <label>Frame Rate</label>
          <select
            value={fps}
            onChange={(e) => handleFpsChange(Number(e.target.value))}
            disabled={exporting}
          >
            {FRAME_RATES.map((fr) => (
              <option key={fr.value} value={fr.value}>
                {fr.label}{fr.value === defaultFps ? " (source)" : ""}
              </option>
            ))}
            {!FRAME_RATES.some((fr) => fr.value === defaultFps) && (
              <option value={defaultFps}>
                {defaultFps} fps (source)
              </option>
            )}
          </select>
        </div>

        {error && <div className="dialog-error">{error}</div>}

        {exporting && (
          <div className="export-progress">
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {progress >= 1
                ? "Export complete!"
                : `Exporting... ${Math.round(progress * 100)}%`}
            </span>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="export-actions">
          <button className="toolbar-btn" onClick={handleCancel}>
            {exporting ? "Cancel" : "Close"}
          </button>
          {!exporting && progress < 1 && (
            <button
              className="toolbar-btn toolbar-btn--accent"
              onClick={handleExport}
            >
              Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
