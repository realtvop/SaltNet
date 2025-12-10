import { loadFullMetadata } from "maimai_music_metadata";

const maimaiMusicMetadata = await loadFullMetadata();

self.onmessage = () => self.postMessage(maimaiMusicMetadata);

self.postMessage(maimaiMusicMetadata);
