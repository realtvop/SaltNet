import { pgClient, db, schema } from "../db";
import { type AvailableRegion, meta } from "./maimai_music_metadata";
import { cnVersions } from "./chn";
import { and, eq } from "drizzle-orm";

// MARK: 1. Update versions
{
    const versions: {
        name: string;
        word: string[];
        releaseDate: Date;
        region: "cn" | "jp" | "ex";
    }[] = [];

    // 国服版本手动处理
    for (const version of cnVersions) {
        versions.push({
            name: version.name,
            word: version.word,
            releaseDate: new Date(version.releaseDate),
            region: "cn",
        });
    }

    for (const version of meta.versions) {
        versions.push({
            name: version.version,
            word: [version.word],
            releaseDate: new Date(version.releaseDate),
            region: "jp",
        });
        // 国际服更新了就也加进去
        if (meta.musics.some(music =>
            music.charts.some(chart =>
                (chart.regionVersionOverride?.intl || chart.version) == version.version && chart.availableRegions.includes("intl" as AvailableRegion)
            )
        )) {
            versions.push({
                name: version.version,
                word: [version.word],
                releaseDate: new Date(version.releaseDate),
                region: "ex",
            });
        }
    }

    for (const version of versions) {
        if (await db.query.maimaidxVersions.findFirst({
            where: (versions, { and, eq }) => and(
                eq(versions.name, version.name),
                eq(versions.region, version.region)
            ),
        })) continue;

        await db.insert(schema.maimaidxVersions).values(version);
    }
}

// MARK: 2. Update musics, charts and aliases
{
    const versions = await db.select().from(schema.maimaidxVersions);

    for (const music of meta.musics) {
        // Add music
        if (!await db.query.maimaidxMusics.findFirst({
            where: (musics, { eq }) => eq(musics.title, music.title),
        })) {
            await db.insert(schema.maimaidxMusics).values({
                id: music.id,
                title: music.title,
                artist: music.artist,
                category: music.category as any,
                bpm: music.bpm,
                releaseDate: null,
            });
        }

        // Update charts
        for (const chart of music.charts) {
            const type = { sd: "std", dx: "dx", utage: "utage" }[chart.type] as any;
            const difficulty = { 0: "basic", 1: "advanced", 2: "expert", 3: "master", 4: "remaster", 10: "utage" }[chart.difficulty] as any;
            const chartVersions = chart.availableRegions.map(availableRegion => {
                const chartVersion = availableRegion === "jp" ? chart.version : (chart.regionVersionOverride && chart.regionVersionOverride[availableRegion] || chart.version);
                const region = { jp: "jp", intl: "ex", us: "us", cn: "cn" }[availableRegion];
                if (region == "us" || !chartVersion) return;
                return versions.find(
                    version => version.region == { jp: "jp", intl: "ex", us: "us", cn: "cn" }[availableRegion] &&
                        version.name.endsWith(chartVersion.toString())
                );
            }).filter((e): e is NonNullable<typeof e> => !!e).map(region => region.id);

            if (!await db.query.maimaidxCharts.findFirst({
                where: (charts, { and, eq }) => and(
                    eq(charts.music, music.title),
                    eq(charts.type, type),
                    eq(charts.difficulty, difficulty),
                ),
            })) {
                // Add chart
                await db.insert(schema.maimaidxCharts).values({
                    music: music.title,
                    type,
                    versions: chartVersions,
                    difficulty: difficulty,
                    level: chart.level,
                    internalLevel: chart.internalLevel.toString(),
                    charter: chart.noteDesigner,
                    tapNotes: chart.noteCounts.tap,
                    holdNotes: chart.noteCounts.hold,
                    slideNotes: chart.noteCounts.slide,
                    touchNotes: chart.noteCounts.touch,
                    breakNotes: chart.noteCounts.break,
                });
            } else {
                // Update chart
                await db.update(schema.maimaidxCharts).set({
                    versions: chartVersions,
                    difficulty: difficulty,
                    level: chart.level,
                    internalLevel: chart.internalLevel.toString(),
                    charter: chart.noteDesigner,
                    tapNotes: chart.noteCounts.tap,
                    holdNotes: chart.noteCounts.hold,
                    slideNotes: chart.noteCounts.slide,
                    touchNotes: chart.noteCounts.touch,
                    breakNotes: chart.noteCounts.break,
                }).where(and(
                    eq(schema.maimaidxCharts.music, music.title),
                    eq(schema.maimaidxCharts.type, type),
                    eq(schema.maimaidxCharts.difficulty, difficulty),
                ));
            }
        }

        // Add aliases
        if (music.aliases && music.aliases.cn) {
            for (const alias of music.aliases.cn) {
                if (!await db.query.maimaidxMusicAliases.findFirst({
                    where: (aliases, { eq }) => eq(aliases.alias, alias),
                })) {
                    await db.insert(schema.maimaidxMusicAliases).values({
                        alias,
                        music: music.title,
                        language: "zh",
                    });
                }
            }
        }
    }
}

// MARK: 3. Update collections
// MARK: TODO

pgClient.end();
