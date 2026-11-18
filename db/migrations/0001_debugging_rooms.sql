CREATE TYPE "public"."debug_room_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TABLE "debug_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invite_code" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"participant_id" uuid,
	"status" "debug_room_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debug_rooms_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "room_requests" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_requests_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "debug_rooms" ADD CONSTRAINT "debug_rooms_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debug_rooms" ADD CONSTRAINT "debug_rooms_participant_id_user_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_requests" ADD CONSTRAINT "room_requests_room_id_debug_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."debug_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_requests" ADD CONSTRAINT "room_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;