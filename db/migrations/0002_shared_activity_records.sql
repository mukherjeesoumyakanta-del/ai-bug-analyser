CREATE TYPE "public"."activity_kind" AS ENUM('execution', 'analysis', 'report');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('running', 'complete', 'error');--> statement-breakpoint
CREATE TABLE "debug_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid,
	"user_id" uuid NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"status" "activity_status" DEFAULT 'running' NOT NULL,
	"code" text NOT NULL,
	"test_cases" jsonb NOT NULL,
	"case_index" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"content" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "debug_activities" ADD CONSTRAINT "debug_activities_room_id_debug_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."debug_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debug_activities" ADD CONSTRAINT "debug_activities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_room_created_idx" ON "debug_activities" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_user_idx" ON "debug_activities" USING btree ("user_id");