import type { ComboStatus, SyncStatus } from "../maiTypes";

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

    status?: CollectionStatus;
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
    difficulties: number[];
    condition: ComboStatus | SyncStatus;
    songs: number[];
}

export interface CollectionStatus {
    owned: boolean;
    inProgress: boolean;
}
