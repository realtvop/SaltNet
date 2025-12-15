import { jsonb, pgEnum, pgTable, serial, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const maimaidxRegionEnum = pgEnum("maimaidx_region", ["jp", "ex", "cn"]);
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at").defaultNow(),

    userName: text("userName").notNull().unique(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),

    pat: text("pat").unique(),

    // maimai DX
    maimaidxRegion: maimaidxRegionEnum("maimaidx_region").default("ex"),
    maimaidxRating: smallint("maimaidx_rating").default(-1),
    maimaidxMusicData: jsonb("maimaidx_music_data").default("[]"),
    maimaidxCollectionData: jsonb("maimaidx_collection_data").default("[]"),
});
