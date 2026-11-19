import type { AnalysisReport as Report, Severity } from "@/lib/analysis-report";

const badges: Record<Severity, string> = {
  critical: "border-red-400/30 bg-red-400/10 text-red-200",
  high: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  low: "border-sky-400/30 bg-sky-400/10 text-sky-200",
};

export default function AnalysisReport({ report, onSelectLine }: {
  report: Report;
  onSelectLine?: (start: number, end: number) => void;
}) {
  const verified = report.executions.length > 0;
  return (
    <article data-analysis-id={report.id} className="min-w-0 space-y-4 text-sm" aria-label="AI analysis report">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-100">Analysis complete</h2>
          <span className="text-xs text-slate-400">{report.language} · {report.findings.length} {report.findings.length === 1 ? "issue" : "issues"}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(report.counts) as [Severity, number][]).map(([severity, count]) => (
            <span key={severity} className={`rounded border px-2 py-1 text-xs capitalize ${badges[severity]}`}>{count} {severity}</span>
          ))}
        </div>
      </header>

      {!verified ? <p className="rounded border border-white/10 px-3 py-2 text-xs text-slate-400">
        Code not executed. Findings are based on static AI analysis.
      </p> : <section className="space-y-2" aria-label="Verified execution results">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Execution evidence · verified</h3>
        {report.executions.map((execution, index) => (
          <details key={index} className="rounded border border-white/10 p-3">
            <summary className="cursor-pointer text-xs">Test {index + 1} · {execution.result.status.replaceAll("_", " ")} · {execution.result.verdict.replaceAll("_", " ")}</summary>
            <dl className="mt-2 space-y-2 text-xs">
              <div><dt className="text-slate-400">Input</dt><dd className="whitespace-pre-wrap break-words font-mono">{execution.input || "(empty)"}</dd></div>
              {execution.expectedOutput !== null && <div><dt className="text-slate-400">Expected output</dt><dd className="whitespace-pre-wrap break-words font-mono">{execution.expectedOutput || "(empty)"}</dd></div>}
              <div><dt className="text-slate-400">Observed output / diagnostics</dt><dd className="whitespace-pre-wrap break-words font-mono">{execution.result.output || "(empty)"}</dd></div>
              {execution.result.truncated && <div className="text-slate-400">Evidence excerpt is truncated.</div>}
            </dl>
          </details>
        ))}
      </section>}

      {!report.findings.length && <p className="rounded border border-white/10 p-4 text-slate-300">No concrete issues identified. AI analysis cannot prove that code is correct.</p>}
      <div className="space-y-3">
        {report.findings.map((finding, index) => (
          <section key={index} className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/40">
            <div className="flex items-start justify-between gap-3 px-3 pt-3">
              <h3 className="min-w-0 font-semibold text-slate-100">
                {finding.startLine && onSelectLine ? (
                  <button type="button" className="text-left hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-300"
                    onClick={() => onSelectLine(finding.startLine!, finding.endLine!)}>
                    {finding.title}
                  </button>
                ) : finding.title}
              </h3>
              <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${badges[finding.severity]}`}>{finding.severity}</span>
            </div>
            {finding.startLine && <p className="px-3 pt-1 text-xs text-slate-400">main.cpp · {finding.startLine === finding.endLine ? `line ${finding.startLine}` : `lines ${finding.startLine}–${finding.endLine}`}</p>}
            {finding.snippet && <pre className="mx-3 mt-2 overflow-x-auto rounded border border-white/5 bg-black/30 p-2 font-mono text-xs leading-relaxed text-slate-300">{finding.snippet}</pre>}
            <dl className="space-y-2 p-3 text-xs leading-relaxed">
              <div><dt className="mb-0.5 font-medium text-slate-300">What went wrong</dt><dd className="text-slate-400">{finding.what}</dd></div>
              <div><dt className="mb-0.5 font-medium text-slate-300">Why it happens</dt><dd className="text-slate-400">{finding.why}</dd></div>
              <div><dt className="mb-0.5 font-medium text-slate-300">Potential impact</dt><dd className="text-slate-400">{finding.impact}</dd></div>
              <div className="rounded border-l-2 border-violet-400 bg-violet-400/5 px-2 py-1">
                <dt className="mb-0.5 font-medium text-violet-200">Debugging hint</dt><dd className="text-slate-300">{finding.hint}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <footer className="space-y-1 border-t border-white/10 pt-3 text-xs text-slate-400">
        {report.findings[0] && <p>Investigate first <span className="font-medium text-slate-200">{report.findings[0].title}</span></p>}
        <p>{verified ? "Execution observations are verified. AI explanations remain findings to investigate." : "Verification pending execution and targeted tests."}</p>
      </footer>
    </article>
  );
}
