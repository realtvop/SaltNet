export const UTAGE_GRADE = 10;

export const BANQUET_GENRES = ["宴会场", "宴会場"] as const;

type ChartDifficultyMeta = {
    shortLabel: string;
    fullLabel: string;
    searchLabel: string;
};

const DEFAULT_DIFFICULTY_META: ChartDifficultyMeta = {
    shortLabel: "MAS",
    fullLabel: "MASTER",
    searchLabel: "MASTER",
};

const CHART_DIFFICULTY_META: Record<number, ChartDifficultyMeta> = {
    0: {
        shortLabel: "BAS",
        fullLabel: "BASIC",
        searchLabel: "BASIC",
    },
    1: {
        shortLabel: "ADV",
        fullLabel: "ADVANCED",
        searchLabel: "ADVANCED",
    },
    2: {
        shortLabel: "EXP",
        fullLabel: "EXPERT",
        searchLabel: "EXPERT",
    },
    3: {
        shortLabel: "MAS",
        fullLabel: "MASTER",
        searchLabel: "MASTER",
    },
    4: {
        shortLabel: "ReM",
        fullLabel: "Re:MASTER",
        searchLabel: "Re:MASTER",
    },
    [UTAGE_GRADE]: {
        shortLabel: "宴",
        fullLabel: "宴",
        searchLabel: "UTAGE",
    },
};

export const STANDARD_DIFFICULTY_GRADE_OPTIONS = [0, 1, 2, 3, 4] as const;
export const EXTENDED_DIFFICULTY_GRADE_OPTIONS = [
    ...STANDARD_DIFFICULTY_GRADE_OPTIONS,
    UTAGE_GRADE,
] as const;

export function isUtageGrade(grade: number): boolean {
    return grade === UTAGE_GRADE;
}

export function isBanquetGenre(genre?: string | number | null): boolean {
    const normalized = String(genre ?? "");
    return BANQUET_GENRES.includes(normalized as (typeof BANQUET_GENRES)[number]);
}

export function getChartDifficultyMeta(grade: number): ChartDifficultyMeta {
    return CHART_DIFFICULTY_META[grade] ?? DEFAULT_DIFFICULTY_META;
}

export function getChartDifficultyBadgeLabel(grade: number): string {
    return getChartDifficultyMeta(grade).shortLabel;
}

export function getChartDifficultyFullLabel(grade: number): string {
    return getChartDifficultyMeta(grade).fullLabel;
}

export function getChartDifficultySearchLabel(grade: number): string {
    return getChartDifficultyMeta(grade).searchLabel;
}

export function getDifficultyFilterOptions(includeUtage: boolean): {
    grade: number;
    label: string;
}[] {
    const grades = includeUtage
        ? EXTENDED_DIFFICULTY_GRADE_OPTIONS
        : STANDARD_DIFFICULTY_GRADE_OPTIONS;

    return grades.map(grade => ({
        grade,
        label: getChartDifficultyFullLabel(grade),
    }));
}
