import { pgTable, text, timestamp, primaryKey, serial, integer, uuid, pgEnum, jsonb, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  password: text("password"),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

export const bugReports = pgTable("bug_reports", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeSnippet: text("code_snippet").notNull(),
  activityId: uuid("activity_id").references((): AnyPgColumn => activities.id, { onDelete: "set null" }),
  bugType: text("bug_type").notNull(),
  severity: text("severity").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const debugRoomStatus = pgEnum("debug_room_status", ["active", "closed"]);

export const debugRooms = pgTable("debug_rooms", {
  id: uuid("id").primaryKey(),
  inviteCode: uuid("invite_code").notNull().unique(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").references(() => users.id, { onDelete: "set null" }),
  status: debugRoomStatus("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roomRequests = pgTable("room_requests", {
  roomId: uuid("room_id").notNull().references(() => debugRooms.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (request) => [primaryKey({ columns: [request.roomId, request.userId] })]);

export const activityKind = pgEnum("activity_kind", ["execution", "analysis", "report"]);
export const activityStatus = pgEnum("activity_status", ["running", "complete", "error"]);

export const activities = pgTable("debug_activities", {
  id: uuid("id").primaryKey(),
  roomId: uuid("room_id").references(() => debugRooms.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: activityKind("kind").notNull(),
  status: activityStatus("status").default("running").notNull(),
  code: text("code").notNull(),
  testCases: jsonb("test_cases").$type<import("../lib/execution-types").TestCase[]>().notNull(),
  caseIndex: integer("case_index").default(0).notNull(),
  result: jsonb("result").$type<import("../lib/execution-types").ExecutionResult>(),
  content: text("content"),
  analysis: jsonb("analysis").$type<import("../lib/analysis-report").AnalysisReport>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (activity) => [index("activity_room_created_idx").on(activity.roomId, activity.createdAt),
  index("activity_user_idx").on(activity.userId)]);
