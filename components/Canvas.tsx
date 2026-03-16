'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { CanvasState, Stroke } from '@/lib/types';
import { Eraser, Pen, RotateCcw, Trash2, Palette, Circle, Square, Minus, PaintBucket } from 'lucide-react';

const COLORS = [
  '#000000', '#ffffff', '#e5e5e5', '#a3a3a3', '#525252', '#262626',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f59e0b', '#6366f1', '#84cc16', '#06b6d4',
];

type DrawTool = 'pen' | 'eraser' | 'fill' | 'circle' | 'rect' | 'line';

// Flood fill algorithm
function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, fillColor: string) {
  const canvas = ctx.canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const toColorArray = (hex: string): [number, number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, 255];
  };

  const px = Math.round(x);
  const py = Math.round(y);
  const idx = (py * canvas.width + px) * 4;
  const targetColor: [number, number, number, number] = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  const fill = toColorArray(fillColor);

  if (
    targetColor[0] === fill[0] &&
    targetColor[1] === fill[1] &&
    targetColor[2] === fill[2] &&
    targetColor[3] === fill[3]
  ) return;

  const matchColor = (i: number) =>
    Math.abs(data[i] - targetColor[0]) < 32 &&
    Math.abs(data[i + 1] - targetColor[1]) < 32 &&
    Math.abs(data[i + 2] - targetColor[2]) < 32 &&
    Math.abs(data[i + 3] - targetColor[3]) < 32;

  const setColor = (i: number) => {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  };

  const stack: number[] = [px + py * canvas.width];
  const visited = new Uint8Array(canvas.width * canvas.height);

  while (stack.length > 0) {
    const pos = stack.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;
    const i = pos * 4;
    if (!matchColor(i)) continue;
    setColor(i);

    const cx = pos % canvas.width;
    const cy = Math.floor(pos / canvas.width);
    if (cx > 0) stack.push(pos - 1);
    if (cx < canvas.width - 1) stack.push(pos + 1);
    if (cy > 0) stack.push(pos - canvas.width);
    if (cy < canvas.height - 1) stack.push(pos + canvas.width);
  }

  ctx.putImageData(imageData, 0, 0);
}

export default function Canvas({ roomId, isDrawer }: { roomId: string, isDrawer: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(8);
  const [tool, setTool] = useState<DrawTool>('pen');

  const [isDrawing, setIsDrawing] = useState(false);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const [canvasState, setCanvasState] = useState<CanvasState | null>(null);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (!stroke.points || stroke.points.length === 0) return;

    ctx.save();
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x, stroke.points[0].y);
      ctx.stroke();
    } else if (stroke.tool === 'circle') {
      if (stroke.points.length < 2) { ctx.restore(); return; }
      const [p0, p1] = [stroke.points[0], stroke.points[stroke.points.length - 1]];
      const rx = Math.abs(p1.x - p0.x) / 2;
      const ry = Math.abs(p1.y - p0.y) / 2;
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (stroke.tool === 'rect') {
      if (stroke.points.length < 2) { ctx.restore(); return; }
      const [p0, p1] = [stroke.points[0], stroke.points[stroke.points.length - 1]];
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    } else if (stroke.tool === 'line') {
      if (stroke.points.length < 2) { ctx.restore(); return; }
      const [p0, p1] = [stroke.points[0], stroke.points[stroke.points.length - 1]];
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    } else {
      // pen
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      if (stroke.points.length === 1) {
        ctx.lineTo(stroke.points[0].x, stroke.points[0].y);
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !canvasState) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
      const completed: Stroke[] = JSON.parse(canvasState.completedStrokes || '[]');
      completed.forEach(stroke => {
        if (stroke.tool === 'fill') {
          // fill strokes are baked in via floodFill directly, skip re-drawing
          // We re-apply them by drawing a tiny invisible rect to trigger fill
          // Actually we need to re-apply fills too
          if (stroke.points.length > 0) {
            floodFill(ctx, stroke.points[0].x, stroke.points[0].y, stroke.color);
          }
        } else {
          drawStroke(ctx, stroke);
        }
      });
    } catch (e) { console.error('Error parsing completed strokes', e); }

    if (!isDrawer && canvasState.activeStroke) {
      try {
        const active: Stroke = JSON.parse(canvasState.activeStroke);
        drawStroke(ctx, active);
      } catch (e) { console.error('Error parsing active stroke', e); }
    }

    if (isDrawer && currentStrokeRef.current) {
      drawStroke(ctx, currentStrokeRef.current);
    }
  }, [canvasState, isDrawer, drawStroke]);

  // Draw shape preview on overlay canvas
  const drawPreview = useCallback((currentPoint: { x: number; y: number }) => {
    const preview = previewCanvasRef.current;
    if (!preview) return;
    const ctx = preview.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, preview.width, preview.height);
    if (!shapeStartRef.current) return;

    const p0 = shapeStartRef.current;
    const p1 = currentPoint;

    ctx.save();
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7;

    if (tool === 'circle') {
      const rx = Math.abs(p1.x - p0.x) / 2;
      const ry = Math.abs(p1.y - p0.y) / 2;
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.beginPath();
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    } else if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    ctx.restore();
  }, [tool, color, size]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || !previewCanvasRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (canvasRef.current && (canvasRef.current.width !== width || canvasRef.current.height !== height)) {
          canvasRef.current.width = width;
          canvasRef.current.height = height;
          if (previewCanvasRef.current) {
            previewCanvasRef.current.width = width;
            previewCanvasRef.current.height = height;
          }
          redraw();
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [redraw]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `rooms/${roomId}/canvas/main`), (doc) => {
      if (doc.exists()) {
        setCanvasState(doc.data() as CanvasState);
      }
    });
    return () => unsub();
  }, [roomId]);

  useEffect(() => {
    redraw();
  }, [canvasState, redraw]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer) return;
    e.preventDefault();
    const coords = getCoordinates(e);

    if (tool === 'fill') {
      // Apply fill immediately
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      floodFill(ctx, coords.x, coords.y, color);

      // Save fill as a stroke
      const fillStroke: Stroke = { tool: 'fill', color, size, points: [coords] };
      getDoc(doc(db, `rooms/${roomId}/canvas/main`)).then(canvasDoc => {
        if (canvasDoc.exists()) {
          const data = canvasDoc.data() as CanvasState;
          const completed: Stroke[] = JSON.parse(data.completedStrokes || '[]');
          completed.push(fillStroke);
          updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
            completedStrokes: JSON.stringify(completed),
            activeStroke: null,
            lastUpdate: Date.now()
          });
        }
      });
      return;
    }

    setIsDrawing(true);
    shapeStartRef.current = coords;
    currentStrokeRef.current = { tool, color, size, points: [coords] };
    redraw();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isDrawer || !currentStrokeRef.current) return;
    e.preventDefault();
    const coords = getCoordinates(e);

    const isShape = tool === 'circle' || tool === 'rect' || tool === 'line';

    if (isShape) {
      // For shapes, only keep start + current point
      currentStrokeRef.current.points = [currentStrokeRef.current.points[0], coords];
      drawPreview(coords);
    } else {
      currentStrokeRef.current.points.push(coords);
      redraw();
    }

    const now = Date.now();
    if (now - lastUpdateRef.current > 100) {
      updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
        activeStroke: JSON.stringify(currentStrokeRef.current),
        lastUpdate: now
      });
      lastUpdateRef.current = now;
    }
  };

  const stopDrawing = async () => {
    if (!isDrawing || !isDrawer || !currentStrokeRef.current) return;
    setIsDrawing(false);

    // Clear preview
    const preview = previewCanvasRef.current;
    if (preview) {
      const ctx = preview.getContext('2d');
      ctx?.clearRect(0, 0, preview.width, preview.height);
    }

    const finalStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    const canvasDoc = await getDoc(doc(db, `rooms/${roomId}/canvas/main`));
    if (canvasDoc.exists()) {
      const data = canvasDoc.data() as CanvasState;
      const completed: Stroke[] = JSON.parse(data.completedStrokes || '[]');
      completed.push(finalStroke);
      await updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
        completedStrokes: JSON.stringify(completed),
        activeStroke: null,
        lastUpdate: Date.now()
      });
    }
  };

  const handleClear = async () => {
    if (!isDrawer) return;
    await updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
      completedStrokes: '[]',
      activeStroke: null,
      clearedAt: Date.now(),
      lastUpdate: Date.now()
    });
  };

  const handleUndo = async () => {
    if (!isDrawer) return;
    const canvasDoc = await getDoc(doc(db, `rooms/${roomId}/canvas/main`));
    if (canvasDoc.exists()) {
      const data = canvasDoc.data() as CanvasState;
      const completed: Stroke[] = JSON.parse(data.completedStrokes || '[]');
      if (completed.length > 0) {
        completed.pop();
        await updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
          completedStrokes: JSON.stringify(completed),
          lastUpdate: Date.now()
        });
      }
    }
  };

  const cursorStyle = tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair';

  const toolBtn = (t: DrawTool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setTool(t)}
      title={label}
      className={`p-2 transition-all border text-xs flex flex-col items-center gap-0.5 ${
        tool === t
          ? 'bg-white text-black border-white'
          : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-400 hover:text-white'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 relative overflow-hidden">
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${cursorStyle}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      >
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full touch-none" />
        <canvas ref={previewCanvasRef} className="absolute top-0 left-0 w-full h-full touch-none pointer-events-none" />
      </div>

      {isDrawer && (
        <div className="border-t border-zinc-800 bg-zinc-950 p-2 z-20 flex flex-col gap-2">
          {/* Tools row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {toolBtn('pen', <Pen size={16} />, 'Pen')}
              {toolBtn('eraser', <Eraser size={16} />, 'Eraser')}
              {toolBtn('fill', <PaintBucket size={16} />, 'Fill Bucket')}
              {toolBtn('line', <Minus size={16} />, 'Line')}
              {toolBtn('rect', <Square size={16} />, 'Rectangle')}
              {toolBtn('circle', <Circle size={16} />, 'Circle')}
            </div>

            <div className="w-px h-8 bg-zinc-800 mx-1" />

            <div className="flex items-center gap-2 flex-1 min-w-[80px] max-w-[160px]">
              <span className="text-zinc-600 text-xs">{size}px</span>
              <input
                type="range"
                min="2"
                max="40"
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="w-px h-8 bg-zinc-800 mx-1" />

            <div className="flex gap-1 ml-auto">
              <button
                onClick={handleUndo}
                title="Undo"
                className="p-2 border border-zinc-700 text-zinc-400 hover:border-zinc-400 hover:text-white transition-all"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={handleClear}
                title="Clear"
                className="p-2 border border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Colors row */}
          <div className="flex items-center gap-1 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
                className={`w-6 h-6 transition-all border ${
                  color === c && tool !== 'eraser'
                    ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-950 border-transparent scale-110'
                    : 'border-zinc-700 hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <div className="relative w-6 h-6 border border-zinc-700 overflow-hidden hover:scale-110 transition-all">
              <input
                type="color"
                value={color}
                onChange={(e) => { setColor(e.target.value); if (tool === 'eraser') setTool('pen'); }}
                className="absolute -top-1 -left-1 w-10 h-10 cursor-pointer opacity-0"
              />
              <Palette size={12} className="absolute inset-0 m-auto text-zinc-400 pointer-events-none" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
