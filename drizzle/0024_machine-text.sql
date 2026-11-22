CREATE TABLE IF NOT EXISTS "machine_text" (
	"lang" text NOT NULL,
	"kind" text NOT NULL,
	"src" text NOT NULL,
	"out" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_text_lang_kind_src_pk" PRIMARY KEY("lang","kind","src")
);
