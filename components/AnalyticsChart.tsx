"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type DataItem = {
  bugType: string;
  count: number;
};

export default function AnalyticsChart({ data }: { data: DataItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
        No analytics data yet. Analyze some bugs to populate!
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis 
          dataKey="bugType" 
          stroke="var(--text-secondary)" 
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }} 
          tickLine={false} 
          axisLine={false} 
        />
        <YAxis 
          stroke="var(--text-secondary)" 
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }} 
          tickLine={false} 
          axisLine={false} 
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.05)" }}
          contentStyle={{
            backgroundColor: "rgba(6,6,14,0.9)",
            border: "1px solid var(--border-glass)",
            borderRadius: "8px",
            color: "var(--text-primary)",
          }}
        />
        <Bar dataKey="count" fill="var(--accent-start)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
