import { useEffect, useState, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toolbar } from "./components/toolbar/Toolbar";
import { LeftPanel } from "./components/left-panel/LeftPanel";
import { PreviewPanel } from "./components/preview/PreviewPanel";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { TimelinePanel } from "./components/timeline/TimelinePanel";
import { ExportDialog } from "./components/export/ExportDialog";
import { HelpDialog } from "./components/help/HelpDialog";
import { useUIStore } from "./stores/ui-store";
import { useProjectStore } from "./stores/project-store";
import { useKeyboardShortcuts } from "./hooks";
import { checkFfmpeg } from "./api/commands";

type ResizeTarget = "left" | "inspector" | "timeline";

interface ResizeState {
  target: ResizeTarget;
  startPos: number;
  startSize: number;
}

function App() {
  const showExportDialog = useUIStore((s) => s.showExportDialog);
  const showHelpDialog = useUIStore((s) => s.showHelpDialog);
  const leftPanelWidth = useUIStore((s) => s.leftPanelWidth);
  const setLeftPanelWidth = useUIStore((s) => s.setLeftPanelWidth);
  const inspectorWidth = useUIStore((s) => s.inspectorWidth);
  const setInspectorWidth = useUIStore((s) => s.setInspectorWidth);
  const timelineHeight = useUIStore((s) => s.timelineHeight);
  const setTimelineHeight = useUIStore((s) => s.setTimelineHeight);
  const projectName = useProjectStore((s) => s.projectName);
  const isDirty = useProjectStore((s) => s.isDirty);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const [resizingTarget, setResizingTarget] = useState<ResizeTarget | null>(
    null,
  );

  const handleResizeStart = useCallback(
    (target: ResizeTarget) => (e: React.MouseEvent) => {
      e.preventDefault();
      const startPos = target === "timeline" ? e.clientY : e.clientX;
      const startSize =
        target === "left"
          ? leftPanelWidth
          : target === "inspector"
            ? inspectorWidth
            : timelineHeight;
      resizeRef.current = { target, startPos, startSize };
      setResizingTarget(target);
    },
    [leftPanelWidth, inspectorWidth, timelineHeight],
  );

  useEffect(() => {
    if (!resizingTarget) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { target, startPos, startSize } = resizeRef.current;
      if (target === "left") {
        setLeftPanelWidth(startSize + (e.clientX - startPos));
      } else if (target === "inspector") {
        setInspectorWidth(startSize - (e.clientX - startPos));
      } else {
        setTimelineHeight(startSize - (e.clientY - startPos));
      }
    };
    const handleMouseUp = () => {
      setResizingTarget(null);
      resizeRef.current = null;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingTarget, setLeftPanelWidth, setInspectorWidth, setTimelineHeight]);

  useKeyboardShortcuts();

  // Check FFmpeg on startup
  useEffect(() => {
    checkFfmpeg().catch((err) => setFfmpegError(String(err)));
  }, []);

  // Sync window title with project name and dirty state
  useEffect(() => {
    const title = `${isDirty ? "* " : ""}${projectName} - FrameCut`;
    getCurrentWindow().setTitle(title);
  }, [projectName, isDirty]);

  return (
    <div className={`app${resizingTarget === "timeline" ? " app--resizing-timeline" : ""}`}>
      {ffmpegError && <div className="ffmpeg-warning">{ffmpegError}</div>}
      <Toolbar />
      <div
        className={`app-main${resizingTarget === "left" || resizingTarget === "inspector" ? " app-main--resizing" : ""}`}
        style={{
          gridTemplateColumns: `${leftPanelWidth}px 4px 1fr 4px ${inspectorWidth}px`,
        }}
      >
        <LeftPanel />
        <div
          className="panel-resize-handle"
          onMouseDown={handleResizeStart("left")}
        />
        <PreviewPanel />
        <div
          className="panel-resize-handle"
          onMouseDown={handleResizeStart("inspector")}
        />
        <InspectorPanel />
      </div>
      <div
        className={`panel-resize-handle panel-resize-handle--horizontal${resizingTarget === "timeline" ? " panel-resize-handle--active" : ""}`}
        onMouseDown={handleResizeStart("timeline")}
      />
      <TimelinePanel
        style={{ height: timelineHeight }}
      />
      {showExportDialog && <ExportDialog />}
      {showHelpDialog && <HelpDialog />}
    </div>
  );
}

export default App;
