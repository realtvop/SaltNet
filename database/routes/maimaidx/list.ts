import { db } from "../../db";

export async function listMusic() {
    // Fetch all versions and build a lookup map by id and region
    const allVersions = await db.query.maimaidxVersions.findMany();
    const versionMap: Record<number, Record<string, string>> = {};
    for (const v of allVersions) {
        if (!versionMap[v.id]) {
            versionMap[v.id] = {};
        }
        versionMap[v.id]![v.region] = v.name;
    }

    // Query all musics with their charts
    const musics = await db.query.maimaidxMusics.findMany({
        with: {
            charts: true,
            aliases: true,
        },
    });

    // Helper function to get version names for a region
    const getVersionNames = (versionIds: number[], region: "jp" | "ex" | "cn"): string => {
        return versionIds
            .map(id => versionMap[id]?.[region])
            .filter(Boolean)
            .join(",");
    };

    // Transform to match Music interface
    const result: Music[] = musics.map(music => ({
        id: music.id ?? 0,
        title: music.title,
        artist: music.artist,
        category: music.category,
        bpm: music.bpm,
        aliases:
            music.aliases.length > 0
                ? { cn: music.aliases.filter(a => a.language === "zh").map(a => a.alias) }
                : undefined,
        charts: music.charts.map(chart => ({
            versions: {
                jp: getVersionNames(chart.versions, "jp"),
                ex: getVersionNames(chart.versions, "ex"),
                cn: getVersionNames(chart.versions, "cn"),
            },
            type: chart.type,
            difficulty: chart.difficulty,
            level: chart.level,
            internalLevel: parseFloat(chart.internalLevel),
            charter: chart.charter,
            notes: {
                tap: chart.tapNotes,
                hold: chart.holdNotes,
                slide: chart.slideNotes,
                touch: chart.touchNotes,
                break: chart.breakNotes,
            },
        })),
    }));

    return result;
}

interface Chart {
    versions: Record<"jp" | "ex" | "cn", string>;
    type: string;
    difficulty: string;
    level: string;
    internalLevel: number;
    charter: string | null;
    notes: {
        tap: number | null;
        hold: number | null;
        slide: number | null;
        touch: number | null;
        break: number | null;
    };
}
interface Music {
    id: number;
    title: string;
    artist: string;
    category: string;
    bpm: number | null;
    aliases?: Record<"cn", string[]>; // when param includes aliases

    charts: Chart[];
}

interface Version {
    id: number;
    name: string;
    word: string[] | null;
    releaseDate: string;
    region: "jp" | "ex" | "cn";
}

/**
 * List all versions
 */
export async function listVersions(): Promise<Version[]> {
    const versions = await db.query.maimaidxVersions.findMany({
        orderBy: (versions, { asc }) => [asc(versions.region), asc(versions.releaseDate)],
    });

    return versions.map(v => ({
        id: v.id,
        name: v.name,
        word: v.word,
        releaseDate: v.releaseDate.toISOString(),
        region: v.region,
    }));
}

interface LatestVersions {
    jp: Version | null;
    ex: Version | null;
    cn: Version | null;
}

/**
 * Get latest version for each region (for B50 calculation to determine "new" songs)
 */
export async function listVersionLatests(): Promise<LatestVersions> {
    const versions = await db.query.maimaidxVersions.findMany({
        orderBy: (versions, { desc }) => [desc(versions.releaseDate)],
    });

    const result: LatestVersions = {
        jp: null,
        ex: null,
        cn: null,
    };

    for (const v of versions) {
        const region = v.region as "jp" | "ex" | "cn";
        if (!result[region]) {
            result[region] = {
                id: v.id,
                name: v.name,
                word: v.word,
                releaseDate: v.releaseDate.toISOString(),
                region: region,
            };
        }
    }

    return result;
}
