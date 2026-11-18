"use client";

import Editor, { type OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  onMount?: OnMount;
  readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, onMount, readOnly = false }: CodeEditorProps) {
  return (
    <div className="monaco-container h-full w-full">
      <Editor
        height="100%"
        width="100%"
        language="cpp"
        theme="vs-dark"
        value={value}
        onChange={onChange ? (val) => onChange(val ?? "") : undefined}
        onMount={onMount}
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
