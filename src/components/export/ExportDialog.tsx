import { useState, useEffect } from "react";
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

  const preset =
    EXPORT_PRESETS.find((p) => p.id === selectedPresetId) ?? EXPORT_PRESETS[0];

  // Listen for export progress events
  useEffect(() => {
    const unlisten1 = listen<{ jobId: string; progress: number }>(
      "export-progress",
      (event) => {
        setProgress(event.payload.progress);
      },
    );

    const unlisten2 = listen<{ jobId: string }>("export-done", () => {
      setExporting(false);
      setProgress(1);
    });

    const unlisten3 = listen<{ jobId: string; error: string }>(
      "export-error",
      (event) => {
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

  const handleExport = async () => {
    setError(null);

    // Build clip refs from timeline
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
          });
        }
      }
    }

    if (clipRefs.length === 0) {
      setError("No clips on timeline to export");
      return;
    }

    // Ask for output path
    const outputPath = await save({
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      defaultPath: "output.mp4",
    });
    if (!outputPath) return;

    setExporting(true);
    setProgress(0);

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
      className="export-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !exporting) {
          setShowExportDialog(false);
        }
      }}
    >
      <div className="export-dialog">
        <h2>Export Video</h2>

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

        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>
            {error}
          </div>
        )}

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
