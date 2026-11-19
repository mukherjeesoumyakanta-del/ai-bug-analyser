"use client";

import { useEffect, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import Editor, { type OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  onMount?: OnMount;
  readOnly?: boolean;
  focusLine?: { start: number; end: number; key: number };
}

export default function CodeEditor({ value, onChange, onMount, readOnly = false, focusLine }: CodeEditorProps) {
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor>();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!instance || !focusLine) return;
    const model = instance.getModel();
    if (!model || focusLine.end > model.getLineCount()) return;
    const decoration = instance.createDecorationsCollection([{
      range: { startLineNumber: focusLine.start, endLineNumber: focusLine.end, startColumn: 1, endColumn: 1 },
      options: { isWholeLine: true, className: "finding-source-line" },
    }]);
    container.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    instance.revealLineInCenter(focusLine.start);
    instance.focus();
    const change = model.onDidChangeContent(() => decoration.clear());
    return () => { change.dispose(); if (!model.isDisposed()) decoration.clear(); };
  }, [instance, focusLine]);

  return (
    <div ref={container} className="monaco-container h-full w-full">
      <Editor
        height="100%"
        width="100%"
        language="cpp"
        theme="vs-dark"
        value={value}
        onChange={onChange ? (val) => onChange(val ?? "") : undefined}
        onMount={(instance, monaco) => { setInstance(instance); onMount?.(instance, monaco); }}
        loading={
          <div className="flex items-center justify-center h-full w-full">
            <div className="flex flex-col items-center gap-3">
              <div className="spinner" />
              <span
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Loading editor…
              </span>
            </div>
          </div>
        }
        options={{
          readOnly,
          fontSize: 14,
          fontFamily: "var(--font-code)",
          fontLigatures: true,
          lineNumbers: "on",
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          cursorBlinking: "smooth",
          minimap: {
            enabled: true,
            scale: 1,
            renderCharacters: false,
          },
          scrollBeyondLastLine: false,
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: "gutter",
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          wordWrap: "off",
          automaticLayout: true,
          tabSize: 4,
          suggest: {
            showKeywords: true,
          },
        }}
      />
    </div>
  );
}
