import type { ComboStatus, SyncStatus, RankRate } from "../maiTypes";

export enum CollectionKind {
    Plate = 1, // 姓名框
    Title = 2, // 称号
    Icon = 3, // 头像
    Character = 9, // 旅行伙伴
    Partner = 10, // 搭档
    Frame = 11, // 背景
}
export enum TitleColor {
    Normal = "Normal",
    Bronze = "Bronze",
    Silver = "Silver",
    Gold = "Gold",
    Rainbow = "Rainbow",
}

export interface Collection {
    type: CollectionKind;
    id: number;
    name: string;
    genre?: string;
    description: string;
    required?: CollectionRequired[];

    status?: CollectionStatus;
}
export type CollectionSongType = "standard" | "dx" | "utage";

export interface CollectionRequiredSong {
    id: number;
    title: string;
    type: CollectionSongType;
    completed?: boolean;
    completedDifficulties?: number[];
}

export interface CollectionRequired {
    difficulties?: number[];
    rate?: RankRate;
    fc?: ComboStatus;
    fs?: SyncStatus;
    songs?: CollectionRequiredSong[];
    completed?: boolean;
}
export interface Character {
    id: number;
    name: string;
    genre: string;
    updateTime: number;
}
export interface Partner extends Collection {}
export interface Icon extends Collection {
    genre: string;
}
export interface Plate extends Collection {
    genre: string;
}
export interface Frame extends Collection {
    genre: string;
}
export interface Title extends Collection {
    color: TitleColor;
    genre: string;
}
export interface VersionPlate extends Plate {
    category: VersionPlateCategory;
}

export type VersionPlateCategory = "極" | "将" | "神" | "舞舞";

export interface CollectionStatus {
    owned: boolean;
    inProgress: boolean;
}
