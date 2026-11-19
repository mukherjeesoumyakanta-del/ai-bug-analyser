import postgres from "postgres";

// Keep the previous production deployment serving until its schema is ready.
if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in Vercel Production before deploying.");
  const client = postgres(process.env.DATABASE_URL, { connect_timeout: 10, max: 1 });
  try {
    const [schema] = await client`select
      to_regclass('public.debug_activities') is not null as activities,
      to_regclass('public.debug_rooms') is not null as rooms,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='bug_reports' and column_name='activity_id') as categories,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='debug_activities' and column_name='analysis') as report`;
    if (!schema.activities || !schema.rooms || !schema.categories || !schema.report) {
      throw new Error("Production database needs the checked-in additive Drizzle migrations. Apply them before redeploying. Existing production data must be preserved.");
    }
  } finally {
    await client.end();
  }
}
