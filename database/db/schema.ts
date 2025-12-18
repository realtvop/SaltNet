import {
    boolean,
    integer,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    serial,
    smallint,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

// MARK: Users
export const maimaidxRegionEnum = pgEnum("maimaidx_region", ["jp", "ex", "cn"]);
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at").defaultNow(),

    userName: text("userName").notNull().unique(),
    email: text("email").unique(),
    password: text("password").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),

    sessions: jsonb("sessions").default("[]"),
    pat: text("pat").unique(),

    // maimai DX
    maimaidxRegion: maimaidxRegionEnum("maimaidx_region").default("ex"),
    maimaidxRating: smallint("maimaidx_rating").default(-1),
});
export interface UserLoginSession {
    application: number | null;
    userAgent: string;
    ipAddress: string;
    lastActive: number; // timestamp
    sessionToken: string; // vaild for 7d
    refreshToken: string; // vaild for 30d
}

// MARK: Applications
export const applications = pgTable("applications", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    owner: integer("owner")
        .references(() => users.id)
        .notNull(),
    clientSecret: text("client_secret").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

// MARK: maimai DX Versions
export const maimaidxVersions = pgTable("maimaidx_versions", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    releaseDate: timestamp("release_date").notNull(),
    region: maimaidxRegionEnum("region").notNull(),
});

// MARK: maimai DX Musics
export const maimaidxMusics = pgTable("maimaidx_musics", {
    id: integer("id"),
    title: text("title").notNull().primaryKey(),
    versions: integer("versions")
        .references(() => maimaidxVersions.id)
        .array()
        .notNull(),
    artist: text("artist").notNull(),
    genre: text("genre").notNull(),
    bpm: integer("bpm").notNull(),
    releaseDate: timestamp("release_date").notNull(),
});

// MARK: maimai DX Charts
export const maimaidxChartTypeEnum = pgEnum("maimaidx_chart_type", ["std", "dx"]);
export const maimaidxChartDifficultyEnum = pgEnum("maimaidx_chart_difficulty", [
    "basic",
    "advanced",
    "expert",
    "master",
    "remaster",
    "utage",
]);
export const maimaidxCharts = pgTable("maimaidx_charts", {
    idx: serial("idx").primaryKey(),
    music: text("music")
        .references(() => maimaidxMusics.title)
        .notNull(),
    type: maimaidxChartTypeEnum("type").notNull(),
    difficulty: maimaidxChartDifficultyEnum("difficulty").notNull(),
    level: text("level").notNull(),
    internalLevel: numeric("internal_level", { precision: 3, scale: 1 }).notNull(),
    charter: text("charter").notNull(),
    tapNotes: smallint("tap_notes").notNull(),
    holdNotes: smallint("hold_notes").notNull(),
    slideNotes: smallint("slide_notes").notNull(),
    touchNotes: smallint("touch_notes").notNull(),
    breakNotes: smallint("break_notes").notNull(),
});

// MARK: maimai DX Scores
export const maimaidxComboStatsEnum = pgEnum("maimaidx_combo_stats", [
    "",
    "fc",
    "fcp",
    "ap",
    "app",
]);
export const maimaidxSyncStatsEnum = pgEnum("maimaidx_sync_stats", [
    "",
    "sync",
    "fs",
    "fsp",
    "fsdx",
    "fsdxp",
]);
export const maimaidxScores = pgTable("maimaidx_scores", {
    id: serial("id").primaryKey(),
    user: integer("user")
        .references(() => users.id)
        .notNull(),
    chart: integer("chart")
        .references(() => maimaidxCharts.idx)
        .notNull(),
    achievements: numeric("achievements", { precision: 7, scale: 4 }),
    deluxeScore: smallint("deluxe_score").notNull(),
    comboStat: maimaidxComboStatsEnum("combo_stat").notNull(),
    syncStat: maimaidxSyncStatsEnum("sync_stat").notNull(),
    playCount: integer("play_count"),
});

// MARK: maimai DX Collections
export const maimaidxCollectionKindEnum = pgEnum("maimaidx_collection_kind", [
    "plate",
    "title",
    "icon",
    "frame",
    "character",
    "partner",
]);
export const maimaidxTitleColorEnum = pgEnum("maimaidx_title_color", [
    "normal",
    "bronze",
    "silver",
    "gold",
    "rainbow",
]);
export const maimaidxCollections = pgTable("maimaidx_collections", {
    id: integer("id").primaryKey(),
    kind: maimaidxCollectionKindEnum("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    titleColor: maimaidxTitleColorEnum("title_color"),
});

// MARK: maimai DX User Collections
export const maimaidxUserCollections = pgTable("maimaidx_user_collections", {
    id: serial("id").primaryKey(),
    user: integer("user")
        .references(() => users.id)
        .notNull(),
    collection: integer("collection")
        .references(() => maimaidxCollections.id)
        .notNull(),
});

// MARK: maimai DX Music Aliases
export const languageEnum = pgEnum("language", ["en", "ja", "zh"]);
export const musicAliases = pgTable("music_aliases", {
    id: serial("id").primaryKey(),
    music: text("music").references(() => maimaidxMusics.title).notNull(),
    alias: text("alias").notNull(),
    language: languageEnum("language").notNull(),
});
