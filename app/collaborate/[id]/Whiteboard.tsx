"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent } from "react";
import { useRoom, useStatus } from "@liveblocks/react";
import { getYjsProviderForRoom } from "@liveblocks/yjs";

const colors = [
  { name: "White", value: "#f8fafc" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Blue", value: "#60a5fa" },
  { name: "Green", value: "#4ade80" },
  { name: "Pink", value: "#f472b6" },
];
const MAX_STROKES = 500;
const MAX_POINTS = 512;

type Point = [number, number];
type Tool = "pen" | "eraser";
type Stroke = { tool: Tool; color: string; points: Point[] };

function paint(context: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke || !Array.isArray(stroke.points) || !stroke.points.length) return;
  const width = context.canvas.width;
  const height = context.canvas.height;
  const erasing = stroke.tool === "eraser";
  const size = width * (erasing ? 0.024 : 0.004);
  const color = colors.find((item) => item.value === stroke.color)?.value ?? colors[0].value;
  const points = stroke.points.slice(0, MAX_POINTS).filter((point) =>
    Array.isArray(point) && point.length === 2 && point.every((n) => Number.isFinite(n) && n >= 0 && n <= 1));
  if (!points.length) return;

  context.globalCompositeOperation = erasing ? "destination-out" : "source-over";
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = size;
  context.lineCap = "round";
  context.lineJoin = "round";
  const [x, y] = points[0];
  context.beginPath();
  if (points.length === 1) {
    context.arc(x * width, y * height, size / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.moveTo(x * width, y * height);
    for (const [nextX, nextY] of points.slice(1)) context.lineTo(nextX * width, nextY * height);
    context.stroke();
  }
  context.globalCompositeOperation = "source-over";
}

function position(event: PointerEvent<HTMLCanvasElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return [clamp((event.clientX - bounds.left) / bounds.width), clamp((event.clientY - bounds.top) / bounds.height)];
}

export default function Whiteboard() {
  const room = useRoom();
  const status = useStatus();
  const provider = getYjsProviderForRoom(room);
  const strokes = provider.getYDoc().getArray<Stroke>("whiteboard");
  const ready = useSyncExternalStore((notify) => {
    provider.on("sync", notify);
    return () => provider.off("sync", notify);
  }, () => provider.synced, () => false);
  const count = useSyncExternalStore((notify) => {
    strokes.observe(notify);
    return () => strokes.unobserve(notify);
  }, () => strokes.length, () => 0);
  const enabled = ready && status === "connected";

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(colors[0].value);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ pointer: number; stroke: Stroke } | null>(null);
  const repaint = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;
    function schedule() {
      if (frame || !canvas || !context) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokes.toArray().slice(-MAX_STROKES)) paint(context, stroke);
        if (active.current) paint(context, active.current.stroke);
      });
    }
    const observer = new ResizeObserver(() => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      schedule();
    });
    observer.observe(canvas);
    strokes.observe(schedule);
    repaint.current = schedule;
    schedule();
    return () => {
      observer.disconnect();
      strokes.unobserve(schedule);
      cancelAnimationFrame(frame);
      repaint.current = () => undefined;
    };
  }, [strokes]);

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (!enabled || count >= MAX_STROKES || active.current || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { pointer: event.pointerId, stroke: { color, tool, points: [position(event)] } };
    repaint.current();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const drawing = active.current;
    if (!drawing || drawing.pointer !== event.pointerId) return;
    const points = drawing.stroke.points;
    const [x, y] = position(event);
    const [lastX, lastY] = points[points.length - 1];
    if (points.length < MAX_POINTS && Math.hypot(x - lastX, y - lastY) >= 0.002) {
      points.push([x, y]);
      repaint.current();
    }
  }

  function finish(event: PointerEvent<HTMLCanvasElement>, commit: boolean) {
    const drawing = active.current;
    if (!drawing || drawing.pointer !== event.pointerId) return;
    if (commit && enabled) move(event);
    active.current = null;
    if (commit && enabled && strokes.length < MAX_STROKES) strokes.push([drawing.stroke]);
    repaint.current();
  }

  function clear() {
    if (!enabled || !strokes.length || !window.confirm("Clear the shared board for both participants?")) return;
    active.current = null;
    strokes.delete(0, strokes.length);
    repaint.current();
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(["pen", "eraser"] as const).map((choice) => <button type="button" key={choice}
          aria-pressed={tool === choice} disabled={!enabled} onClick={() => setTool(choice)}
          className="rounded border border-white/15 px-3 py-1 capitalize aria-pressed:border-violet-300 aria-pressed:bg-violet-900/60 disabled:opacity-50">{choice === "pen" ? "Pen" : "Eraser"}</button>)}
        <div className="flex gap-2 px-2" aria-label="Pen colors">
          {colors.map((item) => <button type="button" key={item.name} aria-label={item.name}
            aria-pressed={color === item.value && tool === "pen"} disabled={!enabled}
            onClick={() => { setColor(item.value); setTool("pen"); }}
            className="size-8 rounded-full border border-white/30 aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-violet-300 disabled:opacity-50"
            style={{ backgroundColor: item.value }} />)}
        </div>
        <button type="button" disabled={!enabled || !count} onClick={clear}
          className="ml-auto rounded border border-white/15 px-3 py-1 hover:bg-white/10 disabled:opacity-50">Clear board</button>
      </div>
      {!enabled && <p role="status" className="text-sm text-slate-300">Waiting for the shared board to connect…</p>}
      {count >= MAX_STROKES && <p role="status" className="text-sm text-slate-300">Board is full. Clear it to draw more.</p>}
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111525]">
        <canvas ref={canvasRef} aria-label="Shared drawing canvas"
          className="block aspect-video w-full touch-none"
          style={{ cursor: enabled ? "crosshair" : "wait" }}
          onPointerDown={start} onPointerMove={move} onPointerUp={(event) => finish(event, true)}
          onPointerCancel={(event) => finish(event, false)} onLostPointerCapture={(event) => finish(event, false)} />
      </div>
    </div>
  );
}
