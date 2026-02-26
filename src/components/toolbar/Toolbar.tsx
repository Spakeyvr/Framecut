import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";

export function Toolbar() {
  const projectName = useProjectStore((s) => s.projectName);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);

  return (
    <div className="toolbar">
      <span className="toolbar-title">{projectName}</span>
      <button className="toolbar-btn" onClick={undo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button className="toolbar-btn" onClick={redo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
      <button
        className="toolbar-btn toolbar-btn--accent"
        onClick={() => setShowExportDialog(true)}
      >
        Export
      </button>
    </div>
  );
}
