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

const TOOL_KEYS: Record<string, DrawTool> = {
  '1': 'pen', '2': 'eraser', '3': 'fill', '4': 'line', '5': 'rect', '6': 'circle',
  'e': 'eraser', 'p': 'pen',
};

// ── Flood fill ────────────────────────────────────────────────────────────────
function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, fillColor: string) {
  const canvas = ctx.canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const r = parseInt(fillColor.slice(1, 3), 16);
  const g = parseInt(fillColor.slice(3, 5), 16);
  const b = parseInt(fillColor.slice(5, 7), 16);

  const px = Math.round(x);
  const py = Math.round(y);
  const idx = (py * canvas.width + px) * 4;
  const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];

  if (tr === r && tg === g && tb === b && ta === 255) return;

  const match = (i: number) =>
    Math.abs(data[i] - tr) < 32 && Math.abs(data[i + 1] - tg) < 32 &&
    Math.abs(data[i + 2] - tb) < 32 && Math.abs(data[i + 3] - ta) < 32;

  const stack = [px + py * canvas.width];
  const visited = new Uint8Array(canvas.width * canvas.height);

  while (stack.length) {
    const pos = stack.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;
    const i = pos * 4;
    if (!match(i)) continue;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    const cx = pos % canvas.width, cy = Math.floor(pos / canvas.width);
    if (cx > 0) stack.push(pos - 1);
    if (cx < canvas.width - 1) stack.push(pos + 1);
    if (cy > 0) stack.push(pos - canvas.width);
    if (cy < canvas.height - 1) stack.push(pos + canvas.width);
  }
  ctx.putImageData(imageData, 0, 0);
}

// ── Draw a single stroke onto a context ──────────────────────────────────────
function applyStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points?.length) return;
  ctx.save();
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.forEach(p => ctx.lineTo(p.x, p.y));
    if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
    ctx.stroke();
  } else if (stroke.tool === 'fill') {
    if (stroke.points[0]) floodFill(ctx, stroke.points[0].x, stroke.points[0].y, stroke.color);
  } else if (stroke.tool === 'circle') {
    if (stroke.points.length < 2) { ctx.restore(); return; }
    const p0 = stroke.points[0], p1 = stroke.points[stroke.points.length - 1];
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    ctx.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stroke.tool === 'rect') {
    if (stroke.points.length < 2) { ctx.restore(); return; }
    const p0 = stroke.points[0], p1 = stroke.points[stroke.points.length - 1];
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  } else if (stroke.tool === 'line') {
    if (stroke.points.length < 2) { ctx.restore(); return; }
    const p0 = stroke.points[0], p1 = stroke.points[stroke.points.length - 1];
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  } else {
    // pen — smooth with quadratic curves
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
    } else if (stroke.points.length === 2) {
      ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
    } else {
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const mx = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const my = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, mx, my);
      }
      const last = stroke.points[stroke.points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ── Scale a context for devicePixelRatio ─────────────────────────────────────
function scaleCtx(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.scale(dpr, dpr);
}

export default function Canvas({ roomId, isDrawer }: { roomId: string; isDrawer: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);       // committed strokes
  const activeCanvasRef = useRef<HTMLCanvasElement>(null); // current stroke (drawer live)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);// shape preview overlay
  const containerRef = useRef<HTMLDivElement>(null);

  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(8);
  const [tool, setTool] = useState<DrawTool>('pen');

  const isDrawingRef = useRef(false);
  const [isDrawingState, setIsDrawingState] = useState(false); // for cursor only
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastFirestoreUpdateRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [canvasState, setCanvasState] = useState<CanvasState | null>(null);
  const canvasStateRef = useRef<CanvasState | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getCtx = (ref: React.RefObject<HTMLCanvasElement | null>) => ref.current?.getContext('2d') ?? null;

  const cssSize = useCallback(() => {
    const el = containerRef.current;
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 };
  }, []);

  // Convert CSS coords → canvas logical coords (accounts for DPR scaling)
  const toLogical = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // ── Full redraw of committed canvas from state ────────────────────────────
  const fullRedraw = useCallback((state: CanvasState) => {
    const canvas = canvasRef.current;
    const ctx = getCtx(canvasRef);
    if (!canvas || !ctx) return;
    const { w, h } = cssSize();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    try {
      const strokes: Stroke[] = JSON.parse(state.completedStrokes || '[]');
      strokes.forEach(s => applyStroke(ctx, s));
    } catch { /* ignore */ }

    // Spectators see active stroke on committed canvas
    if (!isDrawer && state.activeStroke) {
      try { applyStroke(ctx, JSON.parse(state.activeStroke)); } catch { /* ignore */ }
    }
    void w; void h;
  }, [isDrawer, cssSize]);

  // ── Resize all canvases ───────────────────────────────────────────────────
  const resizeAll = useCallback(() => {
    const { w, h } = cssSize();
    if (!w || !h) return;
    [canvasRef, activeCanvasRef, previewCanvasRef].forEach(ref => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      scaleCtx(canvas, ctx, w, h);
    });
    if (canvasStateRef.current) fullRedraw(canvasStateRef.current);
  }, [cssSize, fullRedraw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => resizeAll());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [resizeAll]);

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, `rooms/${roomId}/canvas/main`), snap => {
      if (!snap.exists()) return;
      const state = snap.data() as CanvasState;
      setCanvasState(state);
      canvasStateRef.current = state;
      fullRedraw(state);
    });
    return () => unsub();
  }, [roomId, fullRedraw]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDrawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); return; }
      if (e.key === 'Delete') { handleClear(); return; }
      const mapped = TOOL_KEYS[e.key];
      if (mapped) setTool(mapped);
      if (e.key === '[') setSize(s => Math.max(2, s - 2));
      if (e.key === ']') setSize(s => Math.min(40, s + 2));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawer]);

  // ── Shape preview ─────────────────────────────────────────────────────────
  const drawShapePreview = useCallback((p1: { x: number; y: number }) => {
    const ctx = getCtx(previewCanvasRef);
    const canvas = previewCanvasRef.current;
    if (!ctx || !canvas || !shapeStartRef.current) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const p0 = shapeStartRef.current;
    ctx.save();
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.75;
    if (tool === 'circle') {
      ctx.beginPath();
      ctx.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    } else if (tool === 'line') {
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.restore();
  }, [tool, color, size]);

  // ── Incremental draw on active canvas (drawer only) ───────────────────────
  const drawSegment = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = getCtx(activeCanvasRef);
    if (!ctx) return;
    ctx.save();
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }, [tool, color, size]);

  const clearActiveCanvas = useCallback(() => {
    const canvas = activeCanvasRef.current;
    const ctx = getCtx(activeCanvasRef);
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }, []);

  // ── Pointer events ────────────────────────────────────────────────────────
  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) return toLogical(e.touches[0].clientX, e.touches[0].clientY);
    return toLogical((e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer) return;
    e.preventDefault();
    const coords = getCoords(e);

    if (tool === 'fill') {
      const ctx = getCtx(canvasRef);
      if (!ctx) return;
      floodFill(ctx, coords.x, coords.y, color);
      const fillStroke: Stroke = { tool: 'fill', color, size, points: [coords] };
      getDoc(doc(db, `rooms/${roomId}/canvas/main`)).then(snap => {
        if (!snap.exists()) return;
        const data = snap.data() as CanvasState;
        const completed: Stroke[] = JSON.parse(data.completedStrokes || '[]');
        completed.push(fillStroke);
        updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
          completedStrokes: JSON.stringify(completed), activeStroke: null, lastUpdate: Date.now(),
        });
      });
      return;
    }

    isDrawingRef.current = true;
    setIsDrawingState(true);
    shapeStartRef.current = coords;
    lastPointRef.current = coords;
    currentStrokeRef.current = { tool, color, size, points: [coords] };
  };

  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || !isDrawer || !currentStrokeRef.current) return;
    e.preventDefault();
    const coords = getCoords(e);
    const isShape = tool === 'circle' || tool === 'rect' || tool === 'line';

    if (isShape) {
      currentStrokeRef.current.points = [currentStrokeRef.current.points[0], coords];
      drawShapePreview(coords);
    } else {
      // Incremental draw — only draw the new segment, no full redraw
      if (lastPointRef.current) drawSegment(lastPointRef.current, coords);
      lastPointRef.current = coords;
      currentStrokeRef.current.points.push(coords);
    }

    // Throttle Firestore sync to 80ms via rAF
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const now = Date.now();
      if (now - lastFirestoreUpdateRef.current > 80 && currentStrokeRef.current) {
        updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
          activeStroke: JSON.stringify(currentStrokeRef.current),
          lastUpdate: now,
        });
        lastFirestoreUpdateRef.current = now;
      }
    });
  };

  const stopDrawing = async () => {
    if (!isDrawingRef.current || !isDrawer || !currentStrokeRef.current) return;
    isDrawingRef.current = false;
    setIsDrawingState(false);

    // Clear preview + active canvas
    const previewCtx = getCtx(previewCanvasRef);
    const previewCanvas = previewCanvasRef.current;
    if (previewCtx && previewCanvas) {
      previewCtx.save(); previewCtx.setTransform(1, 0, 0, 1, 0, 0);
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.restore();
    }
    clearActiveCanvas();

    const finalStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    lastPointRef.current = null;

    // Bake the finished stroke into the committed canvas
    const ctx = getCtx(canvasRef);
    if (ctx) applyStroke(ctx, finalStroke);

    const snap = await getDoc(doc(db, `rooms/${roomId}/canvas/main`));
    if (snap.exists()) {
      const data = snap.data() as CanvasState;
      const completed: Stroke[] = JSON.parse(data.completedStrokes || '[]');
      completed.push(finalStroke);
      await updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
        completedStrokes: JSON.stringify(completed), activeStroke: null, lastUpdate: Date.now(),
      });
    }
  };

  // ── Undo / Clear ──────────────────────────────────────────────────────────
  const handleUndo = async () => {
    if (!isDrawer) return;
    const snap = await getDoc(doc(db, `rooms/${roomId}/canvas/main`));
    if (!snap.exists()) return;
    const data = snap.data() as CanvasState;
    const completed: Stroke[] = JSON.parse(data.completedStrokes || '[]');
    if (!completed.length) return;
    completed.pop();
    await updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
      completedStrokes: JSON.stringify(completed), lastUpdate: Date.now(),
    });
  };

  const handleClear = async () => {
    if (!isDrawer) return;
    await updateDoc(doc(db, `rooms/${roomId}/canvas/main`), {
      completedStrokes: '[]', activeStroke: null, clearedAt: Date.now(), lastUpdate: Date.now(),
    });
  };

  // ── Tool definitions ──────────────────────────────────────────────────────
  const TOOLS: { id: DrawTool; icon: React.ReactNode; label: string; key: string }[] = [
    { id: 'pen',    icon: <Pen size={15} />,         label: 'Pen',    key: '1' },
    { id: 'eraser', icon: <Eraser size={15} />,      label: 'Eraser', key: '2' },
    { id: 'fill',   icon: <PaintBucket size={15} />, label: 'Fill',   key: '3' },
    { id: 'line',   icon: <Minus size={15} />,       label: 'Line',   key: '4' },
    { id: 'rect',   icon: <Square size={15} />,      label: 'Rect',   key: '5' },
    { id: 'circle', icon: <Circle size={15} />,      label: 'Circle', key: '6' },
  ];

  const cursorStyle = isDrawingState ? 'cursor-crosshair' : tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair';

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 relative overflow-hidden">
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${cursorStyle}`}
        onMouseDown={startDrawing}
        onMouseMove={onMove}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={onMove}
        onTouchEnd={stopDrawing}
      >
        {/* Layer 0: committed strokes */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />
        {/* Layer 1: current stroke (incremental, drawer only) */}
        <canvas ref={activeCanvasRef} className="absolute inset-0 w-full h-full touch-none pointer-events-none" />
        {/* Layer 2: shape preview */}
        <canvas ref={previewCanvasRef} className="absolute inset-0 w-full h-full touch-none pointer-events-none" />
      </div>

      {isDrawer && (
        <div className="border-t border-zinc-800 bg-[#0a0a0a] px-2 pt-2 pb-2 z-20 flex flex-col gap-2">
          {/* Tools + size + actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex gap-1">
              {TOOLS.map(({ id, icon, label, key }) => (
                <button key={id} onClick={() => setTool(id)} title={`${label} [${key}]`}
                  className={`relative w-8 h-8 flex items-center justify-center border transition-all ${
                    tool === id ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-500 hover:text-white'
                  }`}>
                  {icon}
                  <span className={`absolute bottom-0 right-0 text-[7px] font-bold leading-none px-0.5 ${tool === id ? 'text-zinc-500' : 'text-zinc-700'}`}>{key}</span>
                </button>
              ))}
            </div>

            <div className="w-px h-7 bg-zinc-800" />

            <div className="flex items-center gap-2 min-w-[100px] max-w-[140px] flex-1">
              <div className="flex-shrink-0 rounded-full transition-all"
                style={{
                  width: Math.max(4, Math.min(size, 20)), height: Math.max(4, Math.min(size, 20)),
                  backgroundColor: tool === 'eraser' ? '#52525b' : color,
                }} />
              <input type="range" min="2" max="40" value={size}
                onChange={e => setSize(parseInt(e.target.value))}
                className="w-full accent-white" />
              <span className="text-zinc-600 text-[10px] w-6 text-right tabular-nums">{size}</span>
            </div>

            <div className="w-px h-7 bg-zinc-800" />

            <div className="w-7 h-7 border border-zinc-700 flex-shrink-0"
              style={{ backgroundColor: tool === 'eraser' ? 'transparent' : color }} title="Current color">
              {tool === 'eraser' && <div className="w-full h-full flex items-center justify-center"><Eraser size={12} className="text-zinc-500" /></div>}
            </div>

            <div className="flex gap-1 ml-auto">
              <button onClick={handleUndo} title="Undo [Ctrl+Z]"
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-white transition-all">
                <RotateCcw size={14} />
              </button>
              <button onClick={handleClear} title="Clear [Del]"
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 text-zinc-400 hover:border-red-600 hover:text-red-400 transition-all">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Colors */}
          <div className="flex items-center gap-1 flex-wrap">
            {COLORS.map(c => (
              <button key={c} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }} title={c}
                className={`w-5 h-5 transition-all border flex-shrink-0 ${
                  color === c && tool !== 'eraser'
                    ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0a0a0a] border-transparent scale-110'
                    : 'border-zinc-800 hover:scale-110 hover:border-zinc-500'
                }`}
                style={{ backgroundColor: c }} />
            ))}
            <div className={`relative w-5 h-5 border overflow-hidden hover:scale-110 transition-all flex-shrink-0 ${
              !COLORS.includes(color) && tool !== 'eraser'
                ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0a0a0a] border-transparent scale-110'
                : 'border-zinc-800 hover:border-zinc-500'
            }`}>
              <input type="color" value={color}
                onChange={e => { setColor(e.target.value); if (tool === 'eraser') setTool('pen'); }}
                className="absolute -top-1 -left-1 w-10 h-10 cursor-pointer opacity-0" />
              <Palette size={11} className="absolute inset-0 m-auto text-zinc-400 pointer-events-none" />
            </div>
            <span className="ml-auto text-[9px] text-zinc-700 hidden sm:block select-none">[ ] size · ctrl+z undo</span>
          </div>
        </div>
      )}
    </div>
  );
}
