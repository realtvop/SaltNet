import type { ComboStatus, RankRate, SyncStatus } from "@/components/data/maiTypes";

export interface LXNSAuth {
    accessToken: string | null;
    refreshToken: string | null;
    tokenType: string | null;
    expiresAt?: number | null;
}

export interface LXNSScore {
    achievements: number;
    dx_rating: number;
    dx_score: number;
    dx_star: number;
    fc: ComboStatus;
    fs: SyncStatus;
    id: number;
    level: string;
    level_index: number;
    rate: RankRate;
    song_name: string;
    type: "standard" | "dx";
    upload_time: string;
}

export interface LXNSUser {
    name: string;
    rating: number;
    friend_code: number;
    class_rank: number;
    course_rank: number;
    star: number;
    upload_time: string;
    icon: LXNSCollection;
    trophy: LXNSCollection;
}

interface LXNSCollection {
    id: number;
    name: string;
    genre: string;
    color?: string;
}

export interface LXNSResponse<T> {
    code: number;
    data: T;
    success: boolean;
}

export interface LXNSUploadScore {
    id: number;
    type: "standard" | "dx";
    level_index: number;
    achievements: number;
    fc: string | null;
    fs: string | null;
    dx_score: number;
    play_time?: string;
}

export interface LXNSUploadScoreRequest {
    scores: LXNSUploadScore[];
}
