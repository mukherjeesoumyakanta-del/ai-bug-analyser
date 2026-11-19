import { and, desc, eq, sql, or, inArray } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activities, debugRooms, bugReports } from "@/db/schema";
import { roomId } from "@/lib/room-id";
import { authOptions } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import AnalyticsChart from "@/components/AnalyticsChart";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/analytics");

  const requested = (await searchParams).report;
  const reportId = typeof requested === "string" && /^\d{1,10}$/.test(requested) ? Number(requested) : 0;
  const rooms = await db.select({ id: debugRooms.id, createdAt: debugRooms.createdAt }).from(debugRooms)
    .where(or(eq(debugRooms.ownerId, userId), eq(debugRooms.participantId, userId)))
    .orderBy(desc(debugRooms.createdAt)).limit(30);
  const accessible = or(eq(activities.userId, userId), inArray(activities.roomId,
    db.select({ id: debugRooms.id }).from(debugRooms).where(or(eq(debugRooms.ownerId, userId), eq(debugRooms.participantId, userId)))));
  const ownReports = or(eq(bugReports.userId, userId), inArray(bugReports.activityId,
    db.select({ id: activities.id }).from(activities).where(accessible)));

  const legacyOptions = await db.select({ id: sql<number>`max(${bugReports.id})`, code: bugReports.codeSnippet })
    .from(bugReports).where(ownReports).groupBy(bugReports.codeSnippet)
    .orderBy(desc(sql`max(${bugReports.id})`)).limit(30);
  const selectedLegacy = reportId > 0 && reportId <= 2147483647
    ? (await db.select({ id: bugReports.id, code: bugReports.codeSnippet }).from(bugReports)
        .where(and(ownReports, eq(bugReports.id, reportId))))[0]
    : undefined;
  const activityId = roomId(requested);
  const selectedActivity = activityId ? (await db.select({ id: activities.id, code: activities.code })
    .from(activities).where(and(accessible, eq(activities.id, activityId))))[0] : undefined;
  const selected = selectedActivity ?? selectedLegacy;
  const recentCode = await db.select({ id: activities.id, code: activities.code }).from(activities)
    .where(accessible).orderBy(desc(activities.createdAt)).limit(100);
  const options = [...recentCode, ...legacyOptions].filter((row, index, rows) =>
    rows.findIndex((other) => other.code === row.code) === index).slice(0, 30);
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
  const [totals] = await db.select({
    analyses: sql<number>`count(*) filter (where ${activities.kind} = 'analysis' and ${activities.status} = 'complete')`,
    successful: sql<number>`count(*) filter (where ${activities.kind} = 'execution' and ${activities.status} = 'complete' and ${activities.result}->>'status' = 'success')`,
    failed: sql<number>`count(*) filter (where ${activities.kind} = 'execution' and ${activities.status} = 'complete' and ${activities.result}->>'status' in ('compile_error','runtime_error','timeout'))`,
    unavailable: sql<number>`count(*) filter (where ${activities.kind} = 'execution' and (${activities.status} = 'error' or ${activities.result}->>'status' = 'unknown'))`,
  }).from(activities).where(and(accessible, requested && !selected ? sql`false` : selected ? eq(activities.code, selected.code) : undefined));
  const choices = selected && !options.some((option) => option.id === selected.id) ? [selected, ...options] : options;

  return (
    <div className="flex min-h-screen flex-col text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl p-5 py-8">
        <section className="glass-panel glass-panel-glow space-y-5 p-6">
          <h1 className="text-xl font-semibold">Debugging activity</h1>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Analyses completed", totals.analyses],
              ["Programs completed", totals.successful],
              ["Program failures", totals.failed],
              ["Unavailable outcomes", totals.unavailable],
            ].map(([label, count]) => <div key={label} className="rounded border border-white/10 p-3">
              <p className="text-2xl font-semibold">{Number(count)}</p><p className="text-xs text-slate-400">{label}</p>
            </div>)}
          </div>
          <p className="text-xs text-slate-400">Counts use saved activity records. Historical category-only reports remain below. Program completion does not imply expected output matched.</p>
          <h2 className="font-semibold">Detected bug categories</h2>
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
        <section className="glass-panel mt-5 space-y-3 p-5">
          <h2 className="font-semibold">Recent rooms</h2>
          {!rooms.length && <p className="text-sm text-slate-400">No debugging rooms yet.</p>}
          {rooms.map((room) => <a key={room.id} href={`/collaborate/${room.id}`} className="block break-all text-sm text-violet-300">
            {room.id.slice(0, 8)} · {room.createdAt.toISOString().slice(0, 10)}
          </a>)}
        </section>
      </main>
    </div>
  );
}
