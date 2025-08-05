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
