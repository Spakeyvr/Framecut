import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import {
  openProjectFile,
  saveProject,
  saveProjectDialog,
  confirmUnsavedChanges,
} from "../../api/commands";
import type { Project } from "../../types";

export function Toolbar() {
  const projectName = useProjectStore((s) => s.projectName);
  const filePath = useProjectStore((s) => s.filePath);
  const isDirty = useProjectStore((s) => s.isDirty);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const setShowExportDialog = useUIStore((s) => s.setShowExportDialog);
  const setShowHelpDialog = useUIStore((s) => s.setShowHelpDialog);

  const handleNew = async () => {
    const project = useProjectStore.getState();
    if (project.isDirty) {
      const proceed = await confirmUnsavedChanges();
      if (!proceed) return;
    }
    project.resetProject();
  };

  const handleOpen = async () => {
    const project = useProjectStore.getState();
    if (project.isDirty) {
      const proceed = await confirmUnsavedChanges();
      if (!proceed) return;
    }
    const result = await openProjectFile();
    if (result) {
      const parsed: Project = JSON.parse(result.content);
      project.loadProject(parsed, result.path);
    }
  };

  const handleSaveAs = async () => {
    const project = useProjectStore.getState();
    const data = JSON.stringify(project.getProjectData(), null, 2);
    const path = await saveProjectDialog(data);
    if (path) {
      project.setFilePath(path);
      project.markClean();
    }
  };

  const handleSave = async () => {
    const project = useProjectStore.getState();
    const data = JSON.stringify(project.getProjectData(), null, 2);
    if (filePath) {
      await saveProject(filePath, data);
      project.markClean();
    } else {
      await handleSaveAs();
    }
  };

  return (
    <div className="toolbar">
      <button className="toolbar-btn" onClick={handleNew} title="New Project">
        New
      </button>
      <button className="toolbar-btn" onClick={handleOpen} title="Open Project (Ctrl+O)">
        Open
      </button>
      <button className="toolbar-btn" onClick={handleSave} title="Save Project (Ctrl+S)">
        Save
      </button>
      <span className="toolbar-title">
        {projectName}
        {isDirty && <span className="toolbar-dirty-indicator"> *</span>}
      </span>
      <button className="toolbar-btn" onClick={undo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button className="toolbar-btn" onClick={redo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
      <button
        className="toolbar-btn"
        onClick={() => setShowHelpDialog(true)}
        title="Help (F1 or ?)"
      >
        Help
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
