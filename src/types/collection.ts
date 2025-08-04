enum CollectionType {
    Icon = 'icon',   // 头像
    Plate = 'plate', // 姓名框
    Frame = 'frame', // 背景
    Title = 'title', // 称号
}

export interface Collection {
    type: CollectionType;
    id: number;
    name: string;
    description: string;
    genre: string;

    status: CollectionStatus;
}

export interface CollectionStatus {
    owned: boolean;
    inProgress: boolean;
}