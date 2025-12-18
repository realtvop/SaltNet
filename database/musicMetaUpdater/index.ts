import { pgClient, db, schema } from "../db";
import { type AvalibleRegion, meta } from "./maimai_music_metadata";
import { cnVersions } from "./chn";

// MARK: 1. Update versions
{
    const versions: {
        name: string;
        word: string[];
        releaseDate: Date;
        region: "cn" | "jp" | "ex";
    }[] = [];

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
        if (meta.musics.some(music =>
            music.charts.some(chart =>
                (chart.regionVersionOverride?.intl || chart.version) == version.version && chart.avalibleRegions.includes("intl" as AvalibleRegion)
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

pgClient.end();
