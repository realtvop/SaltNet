import type { MusicDataResponse } from "@/components/integrations/diving-fish/type";
import MusicSort from "./sort.json";
import Charts from "./charts.json";
import { type SavedMusicList } from "@/components/data/music/type";
import { convertDFMusicList } from "@/components/integrations/diving-fish";

export const musicInfo: SavedMusicList = convertDFMusicList(
    Charts.data as unknown as MusicDataResponse
);
export const getMusicInfoAsync = async () => musicInfo;
export { MusicSort };
export const maimaiVersionsCN = [
    "maimai",
    "maimai PLUS",
    "maimai GreeN",
    "maimai GreeN PLUS",
    "maimai ORANGE",
    "maimai ORANGE PLUS",
    "maimai PiNK",
    "maimai PiNK PLUS",
    "maimai MURASAKi",
    "maimai MURASAKi PLUS",
    "maimai MiLK",
    "maimai MiLK PLUS",
    "maimai FiNALE",
    "舞萌DX",
    "舞萌DX 2021",
    "舞萌DX 2022",
    "舞萌DX 2023",
    "舞萌DX 2024",
    "舞萌DX 2025",
];
