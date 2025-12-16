import type { ComboStatus, RankRate, SyncStatus } from "@/components/data/maiTypes";

export interface LXNSScore {
    achievements: number;
    dx_rating: number;
    dx_score: number;
    dx_star: number;
    fc: ComboStatus;
    fs: SyncStatus
    id: number;
    level: string;
    level_index: number;
    rate: RankRate
    song_name: string;
    type: "sd" | "dx";
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