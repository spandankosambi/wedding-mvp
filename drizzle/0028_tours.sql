CREATE TABLE IF NOT EXISTS "tour_progress" (
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"tour" text NOT NULL,
	"how" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tour_progress_user_id_tour_pk" PRIMARY KEY("user_id","tour")
);
