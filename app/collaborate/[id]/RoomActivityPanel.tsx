"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRoom } from "@liveblocks/react";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import AnalysisReportView from "@/components/AnalysisReport";
import type { Activity } from "@/lib/activity-types";
import { MAX_CODE } from "@/lib/execution-types";

export default function RoomActivityPanel({ roomId, onSelectLine }: { roomId: string; onSelectLine: (start: number, end: number) => void }) {
  const room = useRoom();
  const provider = getYjsProviderForRoom(room);
  const text = provider.getYDoc().getText("code");
  const code = useSyncExternalStore((notify) => {
    text.observe(notify);
    return () => text.unobserve(notify);
  }, () => text.toString(), () => "");
  const synced = useSyncExternalStore((notify) => {
    provider.on("sync", notify);
    return () => provider.off("sync", notify);
  }, () => provider.synced, () => false);
  const [records, setRecords] = useState<Activity[]>([]);
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [check, setCheck] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>();
  const pending = useRef(false);
  const mounted = useRef(true);
  const endpoint = `/api/rooms/${roomId}/activities`;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load room history.");
        if (!controller.signal.aborted) setRecords(data.activities);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "History unavailable.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 2500);
      }
    }
    void refresh();
    return () => { mounted.current = false; controller.abort(); clearTimeout(timer); };
  }, [endpoint]);

  async function action(kind: Activity["kind"]) {
    if (pending.current) return;
    if (!code.trim() || new TextEncoder().encode(code).length > MAX_CODE) {
      setError("Enter C++ code of at most 32 KiB.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    const id = crypto.randomUUID();
    setSelected(undefined);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, testCases: [{ input, expectedOutput: check ? expected : null }],
          caseIndex: 0, operation: { id, kind } }),
        signal: AbortSignal.timeout(65_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Room action failed.");
      if (mounted.current && data.activities) setRecords(data.activities);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Request failed. Check room history before trying again.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const active = records.find((record) => record.id === selected) ?? records[0];
  const waiting = busy || records.some((record) => record.status === "running");

  async function copyReport() {
    try { await navigator.clipboard.writeText(active?.content ?? ""); setError(""); }
    catch { setError("Copy failed. Download the report instead."); }
  }
  function downloadReport() {
    if (!active?.content) return;
    const url = URL.createObjectURL(new Blob([active.content], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `debug-report-${active.id}.md`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="min-w-0 border-t border-white/10 p-3" aria-label="Shared debugging results">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Runs & analysis</h2>
        <p className="text-xs text-slate-400">Shared with both participants</p>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-300">Execution input and expected output</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs text-slate-400">Standard input
            <textarea value={input} maxLength={8192} onChange={(e) => setInput(e.target.value)}
              className="mt-1 h-20 w-full rounded border border-white/15 bg-slate-950 p-2 text-white" /></label>
          <label className="min-w-0 text-xs text-slate-400">Expected output
            <textarea value={expected} disabled={!check} maxLength={8192} onChange={(e) => setExpected(e.target.value)}
              className="mt-1 h-20 w-full rounded border border-white/15 bg-slate-950 p-2 text-white disabled:opacity-40" /></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={check} onChange={(e) => setCheck(e.target.checked)} />Check output exactly (blank means empty)</label>
        </div>
      </details>
      <div className="my-3 flex flex-wrap gap-2 text-sm">
        <button disabled={waiting || !synced} onClick={() => action("execution")} className="room-button">Run Code</button>
        <button disabled={waiting || !synced} onClick={() => action("analysis")} className="room-button">Analyze with AI</button>
        <button disabled={waiting || !synced} onClick={() => action("report")} className="room-button">Generate Debug Report</button>
        {waiting && <p role="status" className="self-center text-xs text-slate-400">Room action in progress…</p>}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
      {records.length > 0 && <label className="text-xs text-slate-400">Recorded action
        <select value={active?.id ?? ""} onChange={(e) => setSelected(e.target.value)}
          className="my-2 block w-full min-w-0 rounded border border-white/15 bg-slate-950 p-2">
          {records.map((record) => <option key={record.id} value={record.id}>{record.kind} · {record.status} · {record.id}</option>)}
        </select>
      </label>}
      {active && <div className="space-y-2 rounded border border-white/10 bg-black/10 p-3 text-sm">
        <p className="break-all text-xs text-slate-400">ID {active.id}</p>
        {active.code !== code && <p className="text-amber-200">This result belongs to an older code snapshot.</p>}
        {active.error && <p className="text-amber-200">{active.error}</p>}
        {active.result && <>
          <p>{active.result.status.replaceAll("_", " ")} · {active.result.verdict.replaceAll("_", " ")}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{active.result.output || "(empty output)"}</pre>
          <p className="text-xs text-slate-400">Time {active.result.time ?? "unavailable"} s · Memory {active.result.memory ?? "unavailable"} KiB</p>
          {active.result.truncated && <p className="text-xs text-slate-400">Displayed output is truncated.</p>}
        </>}
        {active.analysis ? <AnalysisReportView report={active.analysis} onSelectLine={active.code === code ? onSelectLine : undefined} /> : active.content && <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{active.content}</pre>}
        {active.kind === "report" && active.content && <div className="flex gap-2">
          <button onClick={copyReport} className="room-button">Copy Markdown</button>
          <button onClick={downloadReport} className="room-button">Download report</button>
        </div>}
        <details><summary className="cursor-pointer text-xs text-slate-400">Source and test snapshot</summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{active.code}</pre>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(active.testCases, null, 2)}</pre>
        </details>
      </div>}
    </section>
  );
}
