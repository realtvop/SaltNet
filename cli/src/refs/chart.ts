/**
 * Turning what was typed into a chart (design 3.1): a chart key, or a song reference followed by
 * a difficulty. A music id picks the chart of that id's own type, since the SD and the DX side of
 * a song have ids of their own; a title or alias has to say which side when both have the
 * difficulty.
 */
import type { Chart } from "@core/music/type";
import type { ChartEntry, Song, SongCatalog } from "../catalog/songs";
import { chartKeyOf, musicType, songCharts } from "../catalog/songs";
import { CliError, usageError } from "../errors";
import { echo } from "../util/echo";
import { closestDifficulties, DIFFICULTIES, difficultyLabel, parseDifficulty } from "./difficulty";
import {
    chartCandidate,
    findChart,
    isMusicId,
    missingChart,
    parseChartKey,
    resolveSong,
    unknownMusicId,
} from "./song";

export type ChartSide = "sd" | "dx";

export interface ChartRef {
    /** A chart key, a music id, or a title, alias or search text. */
    ref: string;
    /** The difficulty, which a chart key already contains and anything else needs. */
    difficulty?: string;
    /** Which side of a song to take when its title or alias fits both (`--type`). */
    type?: ChartSide;
}

function gradeOf(text: string): number {
    const difficulty = parseDifficulty(text);
    if (difficulty) return difficulty.grade;
    const names = DIFFICULTIES.map(entry => entry.value).join("、");
    throw usageError(`无法识别的难度${echo(text)}；可以写 ${names}，或 0–4、10，或 绿黄红紫白宴`, {
        candidates: closestDifficulties(text).map(ref => ({ ref })),
    });
}

const sideOf = (chart: Chart): ChartSide => (musicType(chart.music) === "SD" ? "sd" : "dx");

/** An entry found by id or key must also be of the type `--type` asks for. */
function ofType(entry: ChartEntry, type: ChartSide | undefined): ChartEntry {
    if (!type || sideOf(entry.chart) === type) return entry;
    const grade = entry.chart.info.grade;
    const wanted = songCharts(entry.song).filter(
        chart => chart.info.grade === grade && sideOf(chart) === type
    );
    throw new CliError(
        "NOT_FOUND",
        `谱面 ${chartKeyOf(entry.chart)} 是 ${musicType(entry.chart.music)} 谱面，和 --type ${type} 不符`,
        { candidates: wanted.map(chart => chartCandidate(entry.song, chart)) }
    );
}

function ambiguousSides(song: Song, charts: readonly Chart[]): CliError {
    const label = difficultyLabel(charts[0].info.grade);
    return new CliError(
        "AMBIGUOUS_REF",
        `「${song.title}」的 ${label} 谱面 SD 和 DX 都有；加 --type sd 或 --type dx，或直接用候选的谱面 key`,
        { candidates: charts.map(chart => chartCandidate(song, chart)) }
    );
}

/** The chart a reference names, or `USAGE`, `NOT_FOUND` or `AMBIGUOUS_REF`. */
export function resolveChart(catalog: SongCatalog, input: ChartRef): ChartEntry {
    const text = input.ref.trim();
    if (!text) throw usageError("谱面引用不能为空");
    const grade = input.difficulty === undefined ? undefined : gradeOf(input.difficulty);

    const key = parseChartKey(text);
    if (key) {
        if (grade !== undefined && grade !== key.grade) {
            throw usageError("谱面 key 里已经有难度，和后面给的难度不一致");
        }
        return ofType(findChart(catalog, key.musicId, key.grade), input.type);
    }

    if (grade === undefined) {
        throw usageError(
            "缺少难度：用曲目引用时要再给一个难度（如 mas），也可以直接给谱面 key（如 146-3）"
        );
    }

    if (isMusicId(text)) {
        const musicId = Number(text);
        if (!Number.isSafeInteger(musicId)) throw unknownMusicId(catalog, text);
        return ofType(findChart(catalog, musicId, grade), input.type);
    }

    const song = resolveSong(catalog, text);
    const charts = songCharts(song).filter(
        chart => chart.info.grade === grade && (!input.type || sideOf(chart) === input.type)
    );
    if (charts.length === 0) throw missingChart(song, grade, input.type?.toUpperCase());
    if (charts.length > 1) throw ambiguousSides(song, charts);
    return { chart: charts[0], song };
}
