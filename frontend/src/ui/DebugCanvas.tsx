import { useRef, useEffect } from 'react';
import { type SceneGraph } from '../scene/sceneGraphTypes';

interface DebugCanvasProps {
  sceneGraph: SceneGraph;
  listener: { position: { x: number; z: number }; facingAngle: number };
}

const CANVAS_SIZE = 320;
const PADDING = 30;

/**
 * Top-down 2D debug canvas showing the room boundary, object positions,
 * and the listener's position + facing direction as an arrow.
 *
 * This view is purely for developers/sighted demo observers — it is
 * NOT required to use the app and is marked as decorative.
 */
export default function DebugCanvas({ sceneGraph, listener }: DebugCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    canvas.style.width = `${CANVAS_SIZE}px`;
    canvas.style.height = `${CANVAS_SIZE}px`;
    ctx.scale(dpr, dpr);

    const roomW = sceneGraph.room.dimensions.width;
    const roomD = sceneGraph.room.dimensions.depth;
    const maxDim = Math.max(roomW, roomD);
    const scale = (CANVAS_SIZE - PADDING * 2) / maxDim;

    // Convert room coords (centered at 0,0) to canvas coords
    const toCanvas = (x: number, z: number) => ({
      cx: PADDING + (x + maxDim / 2) * scale,
      cy: PADDING + (z + maxDim / 2) * scale,
    });

    // Clear
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid lines
    ctx.strokeStyle = 'rgba(100, 120, 180, 0.12)';
    ctx.lineWidth = 0.5;
    for (let i = -Math.ceil(maxDim / 2); i <= Math.ceil(maxDim / 2); i++) {
      const { cx: x1, cy: y1 } = toCanvas(i, -maxDim / 2);
      const { cx: x2, cy: y2 } = toCanvas(i, maxDim / 2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const { cx: x3, cy: y3 } = toCanvas(-maxDim / 2, i);
      const { cx: x4, cy: y4 } = toCanvas(maxDim / 2, i);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }

    // Room boundary
    const { cx: rx1, cy: ry1 } = toCanvas(-roomW / 2, -roomD / 2);
    const { cx: rx2, cy: ry2 } = toCanvas(roomW / 2, roomD / 2);
    const rw = rx2 - rx1;
    const rh = ry2 - ry1;

    // Room fill
    ctx.fillStyle = 'rgba(56, 97, 251, 0.06)';
    ctx.fillRect(rx1, ry1, rw, rh);

    // Room border
    ctx.strokeStyle = 'rgba(100, 140, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(rx1, ry1, rw, rh);
    ctx.setLineDash([]);

    // Room label
    ctx.fillStyle = 'rgba(160, 180, 220, 0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${sceneGraph.room.name} (${roomW}×${roomD}m)`,
      rx1 + rw / 2,
      ry1 - 6
    );

    // Objects
    const OBJECT_COLORS: Record<string, string> = {
      table: '#f59e0b',
      window: '#06b6d4',
      appliance: '#ef4444',
      furniture: '#a78bfa',
      door: '#22c55e',
      generic: '#9ca3af',
    };

    for (const obj of sceneGraph.objects) {
      const { cx, cy } = toCanvas(obj.position.x, obj.position.z);
      const color = OBJECT_COLORS[obj.soundCue] || OBJECT_COLORS.generic;

      // Object dot with glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Object outline
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = 'rgba(220, 230, 255, 0.85)';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(obj.label, cx, cy - 10);
    }

    // Listener — arrow shape
    const { cx: lx, cy: ly } = toCanvas(listener.position.x, listener.position.z);
    const arrowLen = 12;
    const arrowAngle = listener.facingAngle;

    // Arrow body
    const tipX = lx + Math.cos(arrowAngle) * arrowLen;
    const tipY = ly + Math.sin(arrowAngle) * arrowLen;
    const baseL_X = lx + Math.cos(arrowAngle + 2.5) * 7;
    const baseL_Y = ly + Math.sin(arrowAngle + 2.5) * 7;
    const baseR_X = lx + Math.cos(arrowAngle - 2.5) * 7;
    const baseR_Y = ly + Math.sin(arrowAngle - 2.5) * 7;

    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseL_X, baseL_Y);
    ctx.lineTo(lx, ly);
    ctx.lineTo(baseR_X, baseR_Y);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Listener center dot
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();

  }, [sceneGraph, listener.position.x, listener.position.z, listener.facingAngle]);

  return (
    <canvas
      ref={canvasRef}
      className="debug-canvas"
      aria-hidden="true"
      role="img"
      aria-label="Debug view: top-down map of room layout. This is a visual aid only and not required to use EchoRoom."
      style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
    />
  );
}
