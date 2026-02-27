import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toolbar } from "./components/toolbar/Toolbar";
import { MediaPool } from "./components/media-pool/MediaPool";
import { PreviewPanel } from "./components/preview/PreviewPanel";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { TimelinePanel } from "./components/timeline/TimelinePanel";
import { ExportDialog } from "./components/export/ExportDialog";
import { HelpDialog } from "./components/help/HelpDialog";
import { useUIStore } from "./stores/ui-store";
import { useProjectStore } from "./stores/project-store";
import { useKeyboardShortcuts } from "./hooks";
import { checkFfmpeg } from "./api/commands";

function App() {
  const showExportDialog = useUIStore((s) => s.showExportDialog);
  const showHelpDialog = useUIStore((s) => s.showHelpDialog);
  const projectName = useProjectStore((s) => s.projectName);
  const isDirty = useProjectStore((s) => s.isDirty);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);

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
    <div className="app">
      {ffmpegError && <div className="ffmpeg-warning">{ffmpegError}</div>}
      <Toolbar />
      <div className="app-main">
        <MediaPool />
        <PreviewPanel />
        <InspectorPanel />
      </div>
      <TimelinePanel />
      {showExportDialog && <ExportDialog />}
      {showHelpDialog && <HelpDialog />}
    </div>
  );
}

export default App;
