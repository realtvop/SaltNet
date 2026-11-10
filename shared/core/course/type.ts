export interface CourseMode {
    id: number;
    name: string;
}

export interface CourseTrack {
    musicId: number;
    title: string;
    /** 0-4 correspond to Basic, Advanced, Expert, Master, and Re:Master. */
    difficulty: number;
}

export interface CourseDamage {
    perfect: number;
    great: number;
    good: number;
    miss: number;
}

export interface CourseLifeRule {
    initial: number;
    recovery: number;
    damage: CourseDamage;
}

export interface Course {
    id: number;
    name: string;
    mode: CourseMode;
    baseDaniId: number;
    isLocked: boolean;
    unlockCourseId: number;
    tracks: CourseTrack[];
    life: CourseLifeRule;
}

export interface CourseDataSet {
    /** Source folder version, for example course155. */
    sourceVersion: number;
    netOpenId: number;
    courses: Course[];
}
