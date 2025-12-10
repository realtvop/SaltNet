import type { MusicMetadata } from 'maimai_music_metadata';
import LoadMusicMetaWorker from './downloader.worker.ts?worker&inline';

const loadMusicMetaWorker = new LoadMusicMetaWorker();

export var musicMetadata: MusicMetadata;

loadMusicMetaWorker.onmessage = (event: MessageEvent<MusicMetadata>) => {
    musicMetadata = event.data;
}
loadMusicMetaWorker.postMessage(0);
