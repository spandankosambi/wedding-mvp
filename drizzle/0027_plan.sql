CREATE TABLE IF NOT EXISTS "plan_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL REFERENCES "weddings"("id") ON DELETE cascade,
	"side" text,
	"meeting_date" date NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'family' NOT NULL,
	"attendees" text,
	"notes" text,
	"decisions" text,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL REFERENCES "weddings"("id") ON DELETE cascade,
	"side" text,
	"title" text NOT NULL,
	"owner_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"owner_name" text,
	"due_date" date,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"meeting_id" uuid REFERENCES "plan_meetings"("id") ON DELETE set null,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_meetings_wedding" ON "plan_meetings" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_tasks_wedding" ON "plan_tasks" USING btree ("wedding_id");
