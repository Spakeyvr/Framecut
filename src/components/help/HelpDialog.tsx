import { useEffect, useMemo, useRef } from "react";
import { useUIStore } from "../../stores/ui-store";
import { SHORTCUTS } from "../../constants/shortcuts";

export function HelpDialog() {
  const setShowHelpDialog = useUIStore((s) => s.setShowHelpDialog);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const shortcutList = useMemo(() => SHORTCUTS, []);

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        setShowHelpDialog(false);
        return;
      }

      if (e.key !== "Tab") return;

      const container = document.querySelector(".help-dialog");
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElementRef.current?.focus();
    };
  }, [setShowHelpDialog]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowHelpDialog(false);
        }
      }}
    >
      <div
        className="modal-dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
      >
        <div className="modal-header">
          <h2 id="help-dialog-title">Help</h2>
          <button
            ref={closeButtonRef}
            className="toolbar-btn"
            aria-label="Close help"
            onClick={() => setShowHelpDialog(false)}
          >
            Close
          </button>
        </div>

        <div className="help-section">
          <h3>How It Works</h3>
          <ol>
            <li>Import media into the Media panel.</li>
            <li>Drag clips to timeline tracks or double-click media to insert.</li>
            <li>Move and trim clips directly on the timeline.</li>
            <li>Use play controls or keyboard shortcuts to review timing.</li>
            <li>Export from the toolbar when your timeline is ready.</li>
          </ol>
        </div>

        <div className="help-section">
          <h3>Keyboard Shortcuts</h3>
          <div className="help-shortcuts">
            {shortcutList.map((shortcut) => (
              <div key={shortcut.id} className="help-shortcut-row">
                <span className="help-shortcut-keys">{shortcut.keys}</span>
                <span className="help-shortcut-desc">{shortcut.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
