CREATE TYPE "public"."maimaidx_chart_difficulty" AS ENUM('basic', 'advanced', 'expert', 'master', 'remaster', 'utage');--> statement-breakpoint
CREATE TYPE "public"."maimaidx_chart_type" AS ENUM('std', 'dx');--> statement-breakpoint
CREATE TYPE "public"."maimaidx_collection_kind" AS ENUM('plate', 'title', 'icon', 'frame', 'character', 'partner');--> statement-breakpoint
CREATE TYPE "public"."maimaidx_combo_stats" AS ENUM('', 'fc', 'fcp', 'ap', 'app');--> statement-breakpoint
CREATE TYPE "public"."maimaidx_region" AS ENUM('jp', 'ex', 'cn');--> statement-breakpoint
CREATE TYPE "public"."maimaidx_sync_stats" AS ENUM('', 'sync', 'fs', 'fsp', 'fsdx', 'fsdxp');--> statement-breakpoint
CREATE TYPE "public"."maimaidx_title_color" AS ENUM('normal', 'bronze', 'silver', 'gold', 'rainbow');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner" integer NOT NULL,
	"client_secret" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maimaidx_charts" (
	"idx" serial PRIMARY KEY NOT NULL,
	"music" text NOT NULL,
	"type" "maimaidx_chart_type" NOT NULL,
	"difficulty" "maimaidx_chart_difficulty" NOT NULL,
	"level" text NOT NULL,
	"internal_level" numeric(3, 1) NOT NULL,
	"charter" text NOT NULL,
	"tap_notes" smallint NOT NULL,
	"hold_notes" smallint NOT NULL,
	"slide_notes" smallint NOT NULL,
	"touch_notes" smallint NOT NULL,
	"break_notes" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maimaidx_collections" (
	"id" integer PRIMARY KEY NOT NULL,
	"kind" "maimaidx_collection_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"title_color" "maimaidx_title_color"
);
--> statement-breakpoint
CREATE TABLE "maimaidx_musics" (
	"id" integer,
	"title" text PRIMARY KEY NOT NULL,
	"versions" integer[] NOT NULL,
	"artist" text NOT NULL,
	"genre" text NOT NULL,
	"bpm" integer NOT NULL,
	"release_date" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maimaidx_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user" integer NOT NULL,
	"chart" integer NOT NULL,
	"achievements" numeric(7, 4),
	"deluxe_score" smallint NOT NULL,
	"combo_stat" "maimaidx_combo_stats" NOT NULL,
	"sync_stat" "maimaidx_sync_stats" NOT NULL,
	"play_count" integer
);
--> statement-breakpoint
CREATE TABLE "maimaidx_user_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user" integer NOT NULL,
	"collection" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maimaidx_versions" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"release_date" timestamp NOT NULL,
	"region" "maimaidx_region" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"userName" text NOT NULL,
	"email" text,
	"password" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"sessions" jsonb DEFAULT '[]',
	"pat" text,
	"maimaidx_region" "maimaidx_region" DEFAULT 'ex',
	"maimaidx_rating" smallint DEFAULT -1,
	CONSTRAINT "users_userName_unique" UNIQUE("userName"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_pat_unique" UNIQUE("pat")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maimaidx_charts" ADD CONSTRAINT "maimaidx_charts_music_maimaidx_musics_title_fk" FOREIGN KEY ("music") REFERENCES "public"."maimaidx_musics"("title") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maimaidx_scores" ADD CONSTRAINT "maimaidx_scores_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maimaidx_scores" ADD CONSTRAINT "maimaidx_scores_chart_maimaidx_charts_idx_fk" FOREIGN KEY ("chart") REFERENCES "public"."maimaidx_charts"("idx") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maimaidx_user_collections" ADD CONSTRAINT "maimaidx_user_collections_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maimaidx_user_collections" ADD CONSTRAINT "maimaidx_user_collections_collection_maimaidx_collections_id_fk" FOREIGN KEY ("collection") REFERENCES "public"."maimaidx_collections"("id") ON DELETE no action ON UPDATE no action;