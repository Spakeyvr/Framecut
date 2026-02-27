import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { startExport, cancelExport } from "../../api/commands";
import { EXPORT_PRESETS } from "../../types";
import type { ClipRef } from "../../types";

export function ExportDialog() {
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);
  const tracks = useProjectStore((s) => s.tracks);
  const media = useProjectStore((s) => s.media);
  const projectFps = useProjectStore((s) => s.projectFps);

  const [selectedPresetId, setSelectedPresetId] = useState(EXPORT_PRESETS[0].id);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentJobIdRef = useRef<string | null>(null);

  const preset =
    EXPORT_PRESETS.find((p) => p.id === selectedPresetId) ?? EXPORT_PRESETS[0];

  useEffect(() => {
    currentJobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    const unlisten1 = listen<{ jobId: string; progress: number }>(
      "export-progress",
      (event) => {
        if (!currentJobIdRef.current || event.payload.jobId !== currentJobIdRef.current) {
          return;
        }
        setProgress(event.payload.progress);
      },
    );

    const unlisten2 = listen<{ jobId: string }>("export-done", (event) => {
      if (!currentJobIdRef.current || event.payload.jobId !== currentJobIdRef.current) {
        return;
      }
      setExporting(false);
      setProgress(1);
    });

    const unlisten3 = listen<{ jobId: string; error: string }>(
      "export-error",
      (event) => {
        if (!currentJobIdRef.current || event.payload.jobId !== currentJobIdRef.current) {
          return;
        }
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
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      defaultPath: "output.mp4",
    });
    if (!outputPath) return;

    setExporting(true);
    setProgress(0);
    setJobId(null);
    currentJobIdRef.current = null;

    try {
      const id = await startExport({
        clips: clipRefs,
        outputPath,
        width: preset.width,
        height: preset.height,
        fps: projectFps,
        codec: preset.codec,
        crf: preset.crf,
        audioBitrate: preset.audioBitrate,
      });
      setJobId(id);
      currentJobIdRef.current = id;
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

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !exporting) {
          setShowExportDialog(false);
        }
      }}
    >
      <div className="modal-dialog export-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Export Video</h2>
        </div>

        <div className="export-field">
          <label>Preset</label>
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            disabled={exporting}
          >
            {EXPORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
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
            <button className="toolbar-btn toolbar-btn--accent" onClick={handleExport}>
              Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
