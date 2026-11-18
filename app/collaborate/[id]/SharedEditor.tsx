"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRoom } from "@liveblocks/react";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { MonacoBinding } from "y-monaco";
import type { editor } from "monaco-editor";
import type { Awareness } from "y-protocols/awareness";
import CodeEditor from "@/components/CodeEditor";

export default function SharedEditor() {
  const room = useRoom();
  const provider = getYjsProviderForRoom(room);
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor>();
  const [bound, setBound] = useState(false);
  const synced = useSyncExternalStore((notify) => {
    provider.on("sync", notify);
    return () => provider.off("sync", notify);
  }, () => provider.synced, () => false);

  useEffect(() => {
    const model = instance?.getModel();
    if (!instance || !model) return;
    let binding: MonacoBinding | undefined;
    let disposed = false;

    function bind(ready: boolean) {
      if (!ready || disposed || binding || !instance || !model || model.isDisposed()) return;
      // Liveblocks implements the awareness methods y-monaco uses.
      binding = new MonacoBinding(provider.getYDoc().getText("code"), model, new Set([instance]), provider.awareness as unknown as Awareness);
      queueMicrotask(() => { if (!disposed) setBound(true); });
    }
    provider.on("sync", bind);
    bind(provider.synced);
    return () => {
      disposed = true;
      provider.off("sync", bind);
      if (!model.isDisposed()) binding?.destroy();
    };
  }, [instance, provider]);

  return <CodeEditor readOnly={!synced || !bound} onMount={(instance, monaco) => {
    // Yjs and Monaco must calculate offsets using the same newline on every OS.
    instance.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
    setInstance(instance);
  }} />;
}
