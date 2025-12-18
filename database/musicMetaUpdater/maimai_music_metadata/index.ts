import type { Music, Version } from "./normal";

export type { Music, Chart, Version } from "./normal";
export type { AvailableRegion, MusicDifficultyID } from "./data";

export { categories } from "./data";

export interface MusicMetadata {
    musics: Music[];
    versions: Version[];
}

const m3URL = "https://meta.salt.realtvop.top/meta.json";

export const meta = (await fetch(m3URL).then(res => res.json())) as MusicMetadata;
