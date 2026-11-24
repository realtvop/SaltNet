import type {
    LXNSCollectionItem,
    LXNSCollectionLists,
    LXNSCollectionRequired,
} from "../integrations/lxns/type";
import type {
    CollectionRequired,
    Frame,
    Icon,
    Plate,
    Title,
    VersionPlate,
    VersionPlateCategory,
} from "./type";
import { CollectionKind, TitleColor } from "./type";

export const versionPlateCategories = ["極", "将", "神", "舞舞"] as const;

export interface MappedCollections {
    icons: Icon[];
    plates: Plate[];
    frames: Frame[];
    titles: Title[];
    genres: {
        icons: string[];
        plates: string[];
        frames: string[];
        titles: string[];
    };
    versionPlates: Record<VersionPlateCategory, VersionPlate[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): boolean {
    return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): boolean {
    return value === undefined || typeof value === "boolean";
}

function isOptionalNumberArray(value: unknown): boolean {
    return value === undefined || (Array.isArray(value) && value.every(isFiniteNumber));
}

function isCachedCollectionSong(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }

    return (
        isFiniteNumber(value.id) &&
        typeof value.title === "string" &&
        (value.type === "standard" || value.type === "dx" || value.type === "utage") &&
        isOptionalBoolean(value.completed) &&
        isOptionalNumberArray(value.completed_difficulties)
    );
}

function isCachedCollectionRequirement(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }

    return (
        isOptionalNumberArray(value.difficulties) &&
        isOptionalString(value.rate) &&
        isOptionalString(value.fc) &&
        isOptionalString(value.fs) &&
        (value.songs === undefined ||
            (Array.isArray(value.songs) && value.songs.every(isCachedCollectionSong))) &&
        isOptionalBoolean(value.completed)
    );
}

function isCachedCollectionItem(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }

    return (
        isFiniteNumber(value.id) &&
        typeof value.name === "string" &&
        (value.color === undefined || value.color === null || typeof value.color === "string") &&
        (value.description === undefined ||
            value.description === null ||
            typeof value.description === "string") &&
        (value.genre === undefined || value.genre === null || typeof value.genre === "string") &&
        (value.required === undefined ||
            value.required === null ||
            (Array.isArray(value.required) && value.required.every(isCachedCollectionRequirement)))
    );
}

/** Checks that stored or downloaded data has the shape of the four LXNS collection lists. */
export function isLXNSCollectionLists(value: unknown): value is LXNSCollectionLists {
    if (!isRecord(value)) {
        return false;
    }

    return (
        Array.isArray(value.trophies) &&
        value.trophies.every(isCachedCollectionItem) &&
        Array.isArray(value.icons) &&
        value.icons.every(isCachedCollectionItem) &&
        Array.isArray(value.plates) &&
        value.plates.every(isCachedCollectionItem) &&
        Array.isArray(value.frames) &&
        value.frames.every(isCachedCollectionItem)
    );
}

function normalizeTitleColor(color: string | null | undefined): TitleColor {
    const normalized = color?.toLowerCase();
    return (
        Object.values(TitleColor).find(value => value.toLowerCase() === normalized) ??
        TitleColor.Normal
    );
}

function mapRequirements(
    requirements: LXNSCollectionRequired[] | null | undefined
): CollectionRequired[] | undefined {
    if (!requirements?.length) {
        return undefined;
    }

    return requirements.map(requirement => ({
        difficulties: requirement.difficulties ? [...requirement.difficulties] : undefined,
        rate: requirement.rate,
        fc: requirement.fc,
        fs: requirement.fs,
        songs: requirement.songs?.map(song => ({
            id: song.id,
            title: song.title,
            type: song.type,
            completed: song.completed,
            completedDifficulties: song.completed_difficulties
                ? [...song.completed_difficulties]
                : undefined,
        })),
        completed: requirement.completed,
    }));
}

function mapCollectionBase(item: LXNSCollectionItem) {
    return {
        id: item.id,
        name: item.name,
        genre: item.genre ?? "",
        description: item.description ?? "",
        required: mapRequirements(item.required),
    };
}

function getVersionPlateCategory(name: string): VersionPlateCategory | null {
    if (name.endsWith("舞舞")) {
        return "舞舞";
    }
    if (name.endsWith("極")) {
        return "極";
    }
    if (name.endsWith("将")) {
        return "将";
    }
    if (name.endsWith("神")) {
        return "神";
    }
    return null;
}

function uniqueGenres(collections: { genre?: string }[]): string[] {
    return [...new Set(collections.map(item => item.genre).filter(Boolean) as string[])];
}

/** Maps the LXNS lists to the collection model used by the app, including version plates. */
export function mapLXNSCollections(data: LXNSCollectionLists): MappedCollections {
    const icons: Icon[] = data.icons.map(item => ({
        ...mapCollectionBase(item),
        type: CollectionKind.Icon,
    }));
    const plates: Plate[] = data.plates.map(item => ({
        ...mapCollectionBase(item),
        type: CollectionKind.Plate,
    }));
    const frames: Frame[] = data.frames.map(item => ({
        ...mapCollectionBase(item),
        type: CollectionKind.Frame,
    }));
    const titles: Title[] = data.trophies.map(item => ({
        ...mapCollectionBase(item),
        type: CollectionKind.Title,
        color: normalizeTitleColor(item.color),
    }));

    const versionPlates: Record<VersionPlateCategory, VersionPlate[]> = {
        極: [],
        将: [],
        神: [],
        舞舞: [],
    };
    for (const category of versionPlateCategories) {
        versionPlates[category] = plates
            .map(plate => ({ plate, category: getVersionPlateCategory(plate.name) }))
            .filter(
                (entry): entry is { plate: Plate; category: VersionPlateCategory } =>
                    entry.category === category && Boolean(entry.plate.required?.length)
            )
            .map(({ plate, category: plateCategory }) => ({
                ...plate,
                category: plateCategory,
            }));
    }

    return {
        icons,
        plates,
        frames,
        titles,
        genres: {
            icons: uniqueGenres(icons),
            plates: uniqueGenres(plates),
            frames: uniqueGenres(frames),
            titles: uniqueGenres(titles),
        },
        versionPlates,
    };
}
