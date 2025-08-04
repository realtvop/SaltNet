export enum CollectionKind {
    Plate = 1, // 姓名框
    Title = 2, // 称号
    Icon = 3, // 头像
    Partner = 10, // 旅行伙伴
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
    description: string;

    status?: CollectionStatus;
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
}

export interface CollectionStatus {
    owned: boolean;
    inProgress: boolean;
}
