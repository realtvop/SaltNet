CREATE TYPE "public"."language" AS ENUM('en', 'ja', 'zh');--> statement-breakpoint
CREATE TABLE "music_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"music" text NOT NULL,
	"alias" text NOT NULL,
	"language" "language" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "music_aliases" ADD CONSTRAINT "music_aliases_music_maimaidx_musics_title_fk" FOREIGN KEY ("music") REFERENCES "public"."maimaidx_musics"("title") ON DELETE no action ON UPDATE no action;