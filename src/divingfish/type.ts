// Structure for a single record from the /dev/player/records endpoint
export interface DivingFishFullRecord {
  achievements: number;
  ds: number;
  dxScore: number;
  fc: string; // '', 'fc', 'fcp', 'ap', 'app'
  fs: string; // '', 'fs', 'fsd', 'fsdp'
  level: string;
  level_index: number; // 0-4 (Basic to Re:Master)
  level_label: string; // Basic, Advanced, Expert, Master, Re:Master
  ra: number; // Single song rating
  rate: string; // 'd', 'c', 'b', 'bb', 'bbb', 'a', 'aa', 'aaa', 's', 'sp', 'ss', 'ssp', 'sss', 'sssp'
  song_id: number;
  title: string;
  type: 'DX' | 'SD';
}

// Basic song info from /music_data
export interface BasicInfo {
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  release_date: string;
  from: string;
  is_new: boolean; // Key field for B50 calculation
}

// Chart specific info from /music_data
export interface ChartInfo {
  notes: number[];
  charter: string;
}

// Structure for a single song from /music_data
export interface MusicInfo {
  id: string; // Song ID as string
  title: string;
  type: 'DX' | 'SD';
  ds: number[]; // Array of difficulties (Basic to Re:Master)
  level: string[]; // Array of level strings
  cids: number[];
  charts: ChartInfo[];
  basic_info: BasicInfo;
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
  records: DivingFishFullRecord[];

  // Calculated Best 50 charts - Now optional as calculation moves to API endpoint
  b50?: {
    dx: DivingFishFullRecord[]; // Best 15 New Version (based on is_new)
    sd: DivingFishFullRecord[]; // Best 35 Old Version (based on is_new)
  };

  // Potentially other fields like user_id, user_data if needed, but not standard in /dev/player/records
  user_id?: unknown | null;
  user_data?: unknown | null;
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