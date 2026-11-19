import type { ExecutionResult, TestCase } from "./execution-types";

export type Activity = {
  id: string;
  roomId: string | null;
  userId: string;
  kind: "execution" | "analysis" | "report";
  status: "running" | "complete" | "error";
  code: string;
  testCases: TestCase[];
  caseIndex: number;
  result: ExecutionResult | null;
  content: string | null;
  analysis: import("./analysis-report").AnalysisReport | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};
