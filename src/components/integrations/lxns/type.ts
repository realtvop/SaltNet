import type { ComboStatus, RankRate, SyncStatus } from "@/components/data/maiTypes";
import type { CollectionRequired, CollectionSongType } from "@/components/data/collection/type";

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
    fc: ComboStatus | null;
    fs: SyncStatus | null;
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

export type LXNSCollectionType = "trophy" | "icon" | "plate" | "frame";

export interface LXNSCollectionRequiredSong {
    id: number;
    title: string;
    type: CollectionSongType;
    completed?: boolean;
    completed_difficulties?: number[];
}

export interface LXNSCollectionRequired extends Omit<CollectionRequired, "songs"> {
    songs?: LXNSCollectionRequiredSong[];
}

export interface LXNSCollectionItem {
    id: number;
    name: string;
    color?: string | null;
    description?: string | null;
    genre?: string | null;
    required?: LXNSCollectionRequired[] | null;
}

export interface LXNSCollectionLists {
    trophies: LXNSCollectionItem[];
    icons: LXNSCollectionItem[];
    plates: LXNSCollectionItem[];
    frames: LXNSCollectionItem[];
}

export interface LXNSResponse<T> {
    code: number;
    data: T;
    success: boolean;
}

export interface LXNSUploadScore {
    id: number;
    type: "standard" | "dx" | "utage";
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
