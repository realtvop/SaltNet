/**
 * What uses a song or a chart (design 3.2, `--with related`): the collections whose conditions
 * name it, the dan courses that have it as a track and the KALEIDXSCOPE gates that take it as a
 * key or pool song. A song is related to whatever one of its charts is related to, and each kind
 * is worked out by the rule behind the matching `charts` filter (`--collection`, `--course`,
 * `--gate`), so a chart is listed here exactly when that filter gives it.
 */
import type { Collection, CollectionRequired } from "@core/collection/type";
import type { Course } from "@core/course";
import type { KaleidxscopeGate, KaleidxscopeSong } from "@core/kaleidxscope";
import type { Chart } from "@core/music/type";
import type { CollectionEntry } from "../refs/collection";
import type { CollectionRow, RequirementRow } from "./collectionView";
import type { CourseInfo } from "./courseView";
import { buildRelatedCollectionsIndex, getRelatedCollections } from "@core/collection/related";
import { requirementMatchesChart } from "@core/collection/versionPlate";
import { courses as shippedCourses } from "@core/course";
import { kaleidxscopeGates } from "@core/kaleidxscope";
import { difficultyLabel } from "../refs/difficulty";
import { listedPools } from "./chartSets";
import { collectionRow, requirementRow } from "./collectionView";
import { courseInfo } from "./courseView";
import { chartKey, chartKeyOf } from "./songs";

/** A condition of a collection, with the charts it asks for among the ones asked about. */
export interface RelatedRequirement extends RequirementRow {
    /** Chart keys, in the order the charts were given. */
    readonly charts: readonly string[];
}

export interface RelatedCollection extends CollectionRow {
    /** Only the conditions that ask for one of the charts, in the order of the data. */
    readonly requirements: readonly RelatedRequirement[];
}

export interface RelatedCourseTrack {
    /** From 1: where the chart is played in the course. */
    readonly track: number;
    readonly chartKey: string;
    readonly difficulty: string;
}

export interface RelatedCourse extends CourseInfo {
    readonly tracks: readonly RelatedCourseTrack[];
}

export interface RelatedGatePool {
    readonly track: number;
    readonly label: string | null;
}

export interface RelatedGate {
    readonly id: string;
    readonly name: string;
    readonly shortName: string;
    readonly region: string;
    /** Whether the key condition names the song. */
    readonly key: boolean;
    /** The pools that list the song (the pool of scrambled charts lists none). */
    readonly pools: readonly RelatedGatePool[];
}

export interface Related {
    readonly collections: readonly RelatedCollection[];
    readonly courses: readonly RelatedCourse[];
    readonly gates: readonly RelatedGate[];
}

export interface RelatedSources {
    /** Every collection, in the order lists give them (`listCollections`). */
    readonly collections: readonly CollectionEntry[];
    /** The courses to look in; the ones that ship with the CLI when omitted. */
    readonly courses?: readonly Course[];
    /** The gates to look in; the ones that ship with the CLI when omitted. */
    readonly gates?: readonly KaleidxscopeGate[];
}

function relatedCollections(
    charts: readonly Chart[],
    entries: readonly CollectionEntry[]
): RelatedCollection[] {
    const index = buildRelatedCollectionsIndex(entries.map(({ collection }) => collection));

    // For each collection that asks for a chart, the charts each of its conditions asks for.
    const found = new Map<Collection, Map<CollectionRequired, string[]>>();
    for (const chart of charts) {
        const key = chartKeyOf(chart);
        const named = index.get(chart.music.id);
        for (const collection of getRelatedCollections(index, chart)) {
            let byRequirement = found.get(collection);
            if (!byRequirement) {
                byRequirement = new Map();
                found.set(collection, byRequirement);
            }
            for (const requirement of named?.get(collection) ?? []) {
                if (!requirementMatchesChart(requirement, chart)) continue;
                const keys = byRequirement.get(requirement);
                if (keys) keys.push(key);
                else byRequirement.set(requirement, [key]);
            }
        }
    }

    return entries.flatMap(entry => {
        const byRequirement = found.get(entry.collection);
        if (!byRequirement) return [];
        const requirements = (entry.collection.required ?? []).flatMap(requirement => {
            const keys = byRequirement.get(requirement);
            return keys ? [{ ...requirementRow(requirement), charts: keys }] : [];
        });
        return [{ ...collectionRow(entry), requirements }];
    });
}

function relatedCourses(charts: readonly Chart[], courses: readonly Course[]): RelatedCourse[] {
    const keys = new Set(charts.map(chartKeyOf));
    return courses.flatMap(course => {
        const tracks = course.tracks.flatMap((track, index) => {
            const key = chartKey(track.musicId, track.difficulty);
            return keys.has(key)
                ? [
                      {
                          track: index + 1,
                          chartKey: key,
                          difficulty: difficultyLabel(track.difficulty),
                      },
                  ]
                : [];
        });
        return tracks.length > 0 ? [{ ...courseInfo(course, courses), tracks }] : [];
    });
}

function relatedGates(charts: readonly Chart[], gates: readonly KaleidxscopeGate[]): RelatedGate[] {
    const musicIds = new Set(charts.map(chart => chart.music.id));
    const names = (songs: readonly KaleidxscopeSong[]) =>
        songs.some(song => musicIds.has(song.musicId));
    return gates.flatMap(gate => {
        const key = names(gate.keyCondition.songs);
        const pools = listedPools(gate)
            .filter(pool => names(pool.songs))
            .map(pool => ({ track: pool.track, label: pool.label ?? null }));
        return key || pools.length > 0
            ? [
                  {
                      id: gate.id,
                      name: gate.name,
                      shortName: gate.shortName,
                      region: gate.region,
                      key,
                      pools,
                  },
              ]
            : [];
    });
}

/**
 * The collections, courses and gates that use any of `charts` (the charts of one song, or one
 * chart). Collections come in the order of `collection list`, courses in the order of
 * `course list` and gates in the order of the `kaleidxscope` overview.
 */
export function relatedTo(charts: readonly Chart[], sources: RelatedSources): Related {
    return {
        collections: relatedCollections(charts, sources.collections),
        courses: relatedCourses(charts, sources.courses ?? shippedCourses),
        gates: relatedGates(charts, sources.gates ?? kaleidxscopeGates),
    };
}
