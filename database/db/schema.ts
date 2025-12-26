import { relations } from "drizzle-orm";
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
export const maimaidxRegions = ["jp", "ex", "cn"] as const;
export const maimaidxRegionEnum = pgEnum("maimaidx_region", maimaidxRegions);
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at").defaultNow(),

    userName: text("userName").notNull().unique(),
    email: text("email").unique(),
    password: text("password"), // nullable for OAuth-only users
    emailVerified: boolean("email_verified").default(false).notNull(),

    sessions: jsonb("sessions").default("[]"),
    pat: text("pat").unique(), // Personal Access Token

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
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    word: text("word").array(),
    releaseDate: timestamp("release_date").notNull(),
    region: maimaidxRegionEnum("region").notNull(),
});

// MARK: maimai DX Musics
export const maimaidxMusicCategories = [
    "POPS＆アニメ",
    "niconico＆ボーカロイド",
    "東方Project",
    "ゲーム＆バラエティ",
    "maimai",
    "オンゲキ＆CHUNITHM",
    "宴会場",
] as const;
export const maimaidxMusicCategoryEnum = pgEnum("maimaidx_music_category", maimaidxMusicCategories);
export const maimaidxMusics = pgTable("maimaidx_musics", {
    id: integer("id"),
    title: text("title").notNull().primaryKey(),
    artist: text("artist").notNull(),
    category: maimaidxMusicCategoryEnum("category").notNull(),
    bpm: integer("bpm"),
    releaseDate: timestamp("release_date"),
});

// MARK: maimai DX Charts
export const maimaidxChartTypes = ["std", "dx", "utage"] as const;
export const maimaidxChartTypeEnum = pgEnum("maimaidx_chart_type", maimaidxChartTypes);
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
    versions: integer("versions")
        .references(() => maimaidxVersions.id)
        .array()
        .notNull(),
    type: maimaidxChartTypeEnum("type").notNull(),
    difficulty: maimaidxChartDifficultyEnum("difficulty").notNull(),
    level: text("level").notNull(),
    internalLevel: numeric("internal_level", { precision: 3, scale: 1 }).notNull(),
    charter: text("charter"),
    tapNotes: smallint("tap_notes"),
    holdNotes: smallint("hold_notes"),
    slideNotes: smallint("slide_notes"),
    touchNotes: smallint("touch_notes"),
    breakNotes: smallint("break_notes"),
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
    "fsd",
    "fsdp",
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
    rating: smallint("rating").notNull(),
    playCount: integer("play_count"),
});

// MARK: maimai DX Collections
export const maimaidxCollectionKinds = [
    "plate",
    "title",
    "icon",
    "frame",
    "character",
    "partner",
] as const;
export const maimaidxCollectionKindEnum = pgEnum(
    "maimaidx_collection_kind",
    maimaidxCollectionKinds
);
export const maimaidxTitleColors = ["normal", "bronze", "silver", "gold", "rainbow"] as const;
export const maimaidxTitleColorEnum = pgEnum("maimaidx_title_color", maimaidxTitleColors);
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

// MARK: OAuth Accounts (Third-party login providers)
export const oauthProviders = ["google", "github"] as const;
export const oauthProviderEnum = pgEnum("oauth_provider", oauthProviders);
export const oauthAccounts = pgTable("oauth_accounts", {
    id: serial("id").primaryKey(),
    user: integer("user")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),
    provider: oauthProviderEnum("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at").defaultNow(),
});

// MARK: maimai DX Music Aliases
export const languages = ["en", "ja", "zh"] as const;
export const languageEnum = pgEnum("language", languages);
export const maimaidxMusicAliases = pgTable("maimaidx_music_aliases", {
    id: serial("id").primaryKey(),
    music: text("music")
        .references(() => maimaidxMusics.title)
        .notNull(),
    alias: text("alias").notNull(),
    language: languageEnum("language").notNull(),
});

// MARK: Relations
export const usersRelations = relations(users, ({ many }) => ({
    applications: many(applications),
    scores: many(maimaidxScores),
    userCollections: many(maimaidxUserCollections),
    oauthAccounts: many(oauthAccounts),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
    owner: one(users, {
        fields: [applications.owner],
        references: [users.id],
    }),
}));

export const maimaidxVersionsRelations = relations(maimaidxVersions, ({ many }) => ({
    musics: many(maimaidxMusics),
}));

export const maimaidxMusicsRelations = relations(maimaidxMusics, ({ many }) => ({
    charts: many(maimaidxCharts),
    aliases: many(maimaidxMusicAliases),
}));

export const maimaidxChartsRelations = relations(maimaidxCharts, ({ one, many }) => ({
    music: one(maimaidxMusics, {
        fields: [maimaidxCharts.music],
        references: [maimaidxMusics.title],
    }),
    scores: many(maimaidxScores),
}));

export const maimaidxScoresRelations = relations(maimaidxScores, ({ one }) => ({
    user: one(users, {
        fields: [maimaidxScores.user],
        references: [users.id],
    }),
    chart: one(maimaidxCharts, {
        fields: [maimaidxScores.chart],
        references: [maimaidxCharts.idx],
    }),
}));

export const maimaidxCollectionsRelations = relations(maimaidxCollections, ({ many }) => ({
    userCollections: many(maimaidxUserCollections),
}));

export const maimaidxUserCollectionsRelations = relations(maimaidxUserCollections, ({ one }) => ({
    user: one(users, {
        fields: [maimaidxUserCollections.user],
        references: [users.id],
    }),
    collection: one(maimaidxCollections, {
        fields: [maimaidxUserCollections.collection],
        references: [maimaidxCollections.id],
    }),
}));

export const maimaidxMusicAliasesRelations = relations(maimaidxMusicAliases, ({ one }) => ({
    music: one(maimaidxMusics, {
        fields: [maimaidxMusicAliases.music],
        references: [maimaidxMusics.title],
    }),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
    user: one(users, {
        fields: [oauthAccounts.user],
        references: [users.id],
    }),
}));
