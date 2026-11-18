import { db } from "../../db";
import { bugReports } from "../../db/schema";
import { sql, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import AnalyticsChart from "@/components/AnalyticsChart";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }

  const data = await db
    .select({
      bugType: bugReports.bugType,
      count: sql<number>`count(${bugReports.id})`,
    })
    .from(bugReports)
    .where(eq(bugReports.userId, session.user.id))
    .groupBy(bugReports.bugType)
    .orderBy(sql`count(${bugReports.id}) desc`);

  const chartData = data.map((d) => ({
    bugType: d.bugType,
    count: Number(d.count),
  }));

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />

      <main className="flex flex-1 p-6 items-center justify-center">
        <section className="glass-panel glass-panel-glow flex flex-col w-full max-w-4xl h-[500px] animate-slide-up-delay-1 p-6">
          <h2 className="text-lg font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
            Bugs Detected by Category
          </h2>
          <div className="flex-1 w-full min-h-0">
            <AnalyticsChart data={chartData} />
          </div>
        </section>
      </main>
    </div>
  );
}
