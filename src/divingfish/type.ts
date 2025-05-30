import type { ChartType, ComboStatus, MusicGenre, MusicOrigin, RankRate, SyncStatus } from "../types/maiTypes";

export interface DivingFishFullRecord {
  achievements: number;
  ds: number;
  dxScore: number;
  fc: ComboStatus;
  fs: SyncStatus;
  level: string;
  level_index: number;
  level_label: string; // Basic, Advanced, Expert, Master, Re:Master
  ra: number;
  rate: RankRate;
  song_id: number;
  title: string;
  type: 'DX' | 'SD';
}

export interface BasicInfo {
  title: string;
  artist: string;
  genre: MusicGenre;
  bpm: number;
  release_date: string;
  from: MusicOrigin;
  is_new: boolean; // Key field for B50 calculation
}

// Chart specific info from /music_data
export interface ChartInfo {
  notes: [number, number, number, number];
  charter: string;
}

// Structure for a single song from /music_data
export interface MusicInfo {
  id: string; // Song ID as string
  title: string;
  type: ChartType;
  ds: number[]; // Array of difficulties (Basic to Re:Master)
  level: string[]; // Array of level strings
  cids: number[];
  charts: ChartInfo[];
  basic_info: BasicInfo;
  aliases?: string[]; // Optional aliases for the song
}

// Response from /music_data endpoint
export type MusicDataResponse = MusicInfo[];

// Successful response from DivingFish API (/dev/player/records)
export interface DivingFishResponse {
  // User info from /dev/player/records
  username: string;
  nickname: string;
  plate: string | null; // Plate might be null
  additional_rating: number; // 段位
  rating: number; // Overall rating

  // Full records list
  records?: DivingFishFullRecord[];

  // Calculated Best 50 charts - Now optional as calculation moves to API endpoint
  charts: DivingFishB50;

  // Potentially other fields like user_id, user_data if needed, but not standard in /dev/player/records
  user_id?: unknown | null;
  user_data?: unknown | null;
}

export interface DivingFishB50 {
  dx: DivingFishFullRecord[]; // Best 15 New Version (based on is_new)
  sd: DivingFishFullRecord[]; // Best 35 Old Version (based on is_new)
}

// Structure for a single chart score (used by /query/player, kept for potential compatibility or future use)
export interface DivingFishMusicChart {
  achievements: number;
  ds: number;
  dxScore: number;
  fc: string;
  fs: string;
  level: string;
  level_index: number;
  level_label: string;
  ra: number;
  rate: string;
  song_id: number;
  title: string;
  type: 'DX' | 'SD';
}

// Error response structure (example)
export interface DivingFishErrorResponse {
  message: string;
  status?: string; // Optional status field
}