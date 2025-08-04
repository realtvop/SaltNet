export enum CollectionKind {
    Title = 1, // 称号
    Icon = 2,  // 头像
    Plate = 3, // 姓名框
    Frame = 4, // 背景
};
export enum TitleColor {
    Bronze = 'Bronze',
    Silver = 'Silver',
    Gold = 'Gold',
    Rainbow = 'Rainbow',
};

export interface Collection {
    type: CollectionKind;
    id: number;
    name: string;
    description: string;

    status?: CollectionStatus;
}
export interface Icon extends Collection {
    genre: string;
};
export interface Plate extends Collection {
    genre: string;
};
export interface Frame extends Collection {
    genre: string;
};
export interface Title extends Collection {
    color: TitleColor;
};

export interface CollectionStatus {
    owned: boolean;
    inProgress: boolean;
}