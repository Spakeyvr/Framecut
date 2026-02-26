import { useRef, useEffect, useCallback } from "react";
import { useUIStore } from "../../stores/ui-store";

function formatRulerTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TimeRuler({ width }: { width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoom = useUIStore((s) => s.timelineZoom);
  const scrollX = useUIStore((s) => s.timelineScrollX);
  const setPlayheadTime = useUIStore((s) => s.setPlayheadTime);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = 24 * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, 24);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, width, 24);

    // Determine tick interval based on zoom
    let interval = 1;
    if (zoom < 20) interval = 10;
    else if (zoom < 50) interval = 5;
    else if (zoom < 100) interval = 2;
    else if (zoom < 200) interval = 1;
    else interval = 0.5;

    const startTime = Math.floor(scrollX / zoom / interval) * interval;
    const endTime = (scrollX + width) / zoom;

    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";

    for (let t = startTime; t <= endTime + interval; t += interval) {
      const x = t * zoom - scrollX;
      if (x < -20 || x > width + 20) continue;

      // Major tick
      ctx.strokeStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(x, 24);
      ctx.stroke();

      // Label
      ctx.fillStyle = "#888";
      ctx.fillText(formatRulerTime(t), x, 13);

      // Minor ticks
      const minorCount = interval >= 2 ? 4 : 2;
      const minorInterval = interval / minorCount;
      for (let i = 1; i < minorCount; i++) {
        const mx = (t + i * minorInterval) * zoom - scrollX;
        if (mx < 0 || mx > width) continue;
        ctx.strokeStyle = "#3a3a3a";
        ctx.beginPath();
        ctx.moveTo(mx, 20);
        ctx.lineTo(mx, 24);
        ctx.stroke();
      }
    }
  }, [width, zoom, scrollX]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x + scrollX) / zoom;
    setPlayheadTime(Math.max(0, time));
  };

  return (
    <div className="time-ruler" onClick={handleClick} style={{ width }}>
      <canvas ref={canvasRef} style={{ width, height: 24, cursor: "pointer" }} />
    </div>
  );
}
