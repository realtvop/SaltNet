import type { MusicDataResponse } from "@/divingfish/type";
import MusicSort from "./sort.json";
import Charts from "./charts.json";
import { type SavedMusicList } from "@/types/music";
import { convertDFMusicList } from "@/divingfish";

export const musicInfo: SavedMusicList = convertDFMusicList(Charts as unknown as MusicDataResponse);
export const getMusicInfoAsync = async () => musicInfo;
export { MusicSort };
