import { convertFileSrc } from "@tauri-apps/api/core";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { importMediaDialog } from "../../api/commands";
import {
  MEDIA_DND_MIME,
  MEDIA_DND_TEXT_PREFIX,
  setDragMediaType,
} from "../../constants/dnd";
import type { MediaItem } from "../../types";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function MediaCard({ item }: { item: MediaItem }) {
  const tracks = useProjectStore((s) => s.tracks);
  const addClip = useProjectStore((s) => s.addClip);
  const playheadTime = useUIStore((s) => s.playheadTime);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(MEDIA_DND_MIME, item.id);
    // WebView variants may only expose text/plain during dragover/drop.
    const fallback = `${MEDIA_DND_TEXT_PREFIX}${item.id}`;
    e.dataTransfer.setData("text/plain", fallback);
    e.dataTransfer.setData("text", fallback);
    e.dataTransfer.effectAllowed = "copy";
    setDragMediaType(item.type);
  };

  const handleDragEnd = () => {
    setDragMediaType(null);
  };

  // Double-click: add clip to first matching track at playhead
  const handleDoubleClick = () => {
    const matchKind = item.type === "audio" ? "audio" : "video";
    const target = tracks.find((t) => t.kind === matchKind) ?? tracks[0];
    if (target) {
      addClip(target.id, item.id, playheadTime);
    }
  };

  return (
    <div
      className="media-item"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDoubleClick={handleDoubleClick}
    >
      {item.thumbnailPath ? (
        <img
          className="media-item-thumb"
          src={convertFileSrc(item.thumbnailPath)}
          alt={item.name}
        />
      ) : (
        <div className="media-item-thumb" />
      )}
      <span className="media-item-name" title={item.name}>
        {item.name}
      </span>
      <span className="media-item-duration">{formatDuration(item.duration)}</span>
    </div>
  );
}

export function MediaPool() {
  const media = useProjectStore((s) => s.media);
  const addMedia = useProjectStore((s) => s.addMedia);

  const handleImport = async () => {
    const items = await importMediaDialog();
    if (items.length > 0) {
      addMedia(items);
    }
  };

  return (
    <>
      <div className="panel-header">
        <span>Media</span>
        <button className="toolbar-btn" onClick={handleImport}>
          + Import
        </button>
      </div>
      <div className="panel-body">
        {media.length === 0 ? (
          <div className="media-pool-empty">
            <span>No media imported</span>
            <span>Click Import or drag files here</span>
          </div>
        ) : (
          <div className="media-grid">
            {media.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
