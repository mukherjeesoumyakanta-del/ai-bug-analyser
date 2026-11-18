import { and, desc, eq, sql } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bugReports } from "@/db/schema";
import { authOptions } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import AnalyticsChart from "@/components/AnalyticsChart";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/analytics");

  const requested = (await searchParams).report;
  const reportId = typeof requested === "string" && /^\d{1,10}$/.test(requested) ? Number(requested) : 0;
  const ownReports = eq(bugReports.userId, userId);

  const options = await db.select({ id: sql<number>`max(${bugReports.id})`, code: bugReports.codeSnippet })
    .from(bugReports).where(ownReports).groupBy(bugReports.codeSnippet)
    .orderBy(desc(sql`max(${bugReports.id})`)).limit(30);
  const selected = reportId > 0 && reportId <= 2147483647
    ? (await db.select({ id: bugReports.id, code: bugReports.codeSnippet }).from(bugReports)
        .where(and(ownReports, eq(bugReports.id, reportId))))[0]
    : undefined;
  const data = requested && !selected ? [] : await db
    .select({ bugType: bugReports.bugType, count: sql<number>`count(*)` })
    .from(bugReports)
    .where(and(
      ownReports,
      selected ? eq(bugReports.codeSnippet, selected.code) : undefined,
      sql`lower(trim(${bugReports.bugType})) <> 'clean code'`,
    ))
    .groupBy(bugReports.bugType).orderBy(desc(sql`count(*)`));
  const chart = data.map((item) => ({ ...item, count: Number(item.count) }));
  const choices = selected && !options.some((option) => option.id === selected.id) ? [selected, ...options] : options;

  return (
    <div className="flex min-h-screen flex-col text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl p-5 py-8">
        <section className="glass-panel glass-panel-glow space-y-5 p-6">
          <h1 className="text-xl font-semibold">Bugs Detected by Category</h1>
          <form method="get" className="flex flex-wrap items-center gap-3">
            <label htmlFor="report" className="text-sm text-slate-300">Code analyzed</label>
            <select id="report" name="report" defaultValue={selected?.id ?? ""}
              className="min-w-0 max-w-full rounded-lg border border-white/15 bg-slate-950 p-2 text-sm">
              <option value="">All saved code</option>
              {choices.map(({ id, code }) => (
                <option key={id} value={id}>#{id} · {code.trim().replace(/\s+/g, " ").slice(0, 75)}</option>
              ))}
            </select>
            <button className="rounded-lg border border-violet-400/50 px-3 py-2 text-sm hover:bg-violet-500/20">Apply</button>
          </form>
          {selected && <details className="rounded-lg border border-white/10 p-3 text-sm">
            <summary className="cursor-pointer">View analyzed C++ source</summary>
            <pre className="mt-3 max-h-48 overflow-auto text-xs text-slate-300">{selected.code}</pre>
          </details>}
          {requested && !selected ? <p className="text-slate-300">This code report is unavailable.</p> :
            <div className="h-[360px]">
              {selected && !chart.length
                ? <p className="pt-10 text-center text-sm text-slate-300">No bugs recorded for this code.</p>
                : <AnalyticsChart data={chart} />}
            </div>}
        </section>
      </main>
    </div>
  );
}
