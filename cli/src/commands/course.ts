import type { CourseInfo, CourseTracks, MissingCourseTrack } from "../catalog/courseView";
import { courses } from "@core/course";
import { courseInfo, courseTracks } from "../catalog/courseView";
import { courseInfoSchema, courseTrackRowSchema, DIFFICULTY_LABELS } from "../catalog/schemas";
import { buildSongCatalog } from "../catalog/songs";
import { paginate } from "../output/paging";
import { extend, int, list, object, str, strEnum } from "../output/schema";
import { resolveCourse } from "../refs/course";
import { listOptions } from "./listOptions";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";

export const courseList = defineCommand(
    {
        name: "course list",
        summary: "列出全部段位：名称、血量规则、曲目数",
        description:
            "按段位数据里的顺序（初段到十段，再到真初段到裏皆伝）列出所有段位，一行一个，不需要曲库。每行有 id、name、mode（段位认定或真段位认定）、locked 和 unlockCourse（要先通关哪个段位才解锁，不用解锁的是 null）、trackCount，以及血量规则 life：initial 是初始血量，recovery 是每首结束后恢复的血量，damage 是 perfect、great、good、miss 各扣多少血量。曲目用 course show 看。",
        category: "gameplay",
        effect: "none",
        output: "list",
        options: { ...listOptions() },
        examples: [
            { command: "course list", description: "全部段位" },
            {
                command: "course list --fields name,life.initial,life.recovery --format tsv",
                description: "只看各段位的初始血量和恢复量，输出成表格",
            },
        ],
        errors: ["USAGE"],
        dataSchema: object(
            { items: list(courseInfoSchema, "全部段位列表") },
            { description: "全部段位列表" }
        ),
    },
    args => {
        const { items, page } = paginate(
            courses.map(course => courseInfo(course)),
            args.options
        );
        return { data: { items }, meta: { page } };
    }
);

export const courseShow = defineCommand(
    {
        name: "course show",
        summary: "一个段位的血量规则和曲目",
        description:
            "段位可以写名称（十段、真皆伝）、id（551010），或者只有一个段位有的一部分名称（真九）；「九」这样几个段位都有的会报 AMBIGUOUS_REF，候选里的 ref 就是名称。结果是 course list 里那一行，再加 tracks 和 missing。tracks 是曲库里有的曲目，按出场顺序，每个是谱面行再加一个 track（第几首，从 1 起），谱面 key 可以直接传给 chart；missing 是曲库里没有的曲目（曲库还没收录的歌），每个有 track、chartKey、musicId、title、difficulty。成绩之后随用户数据加入，现在 score 和 b50 恒为 null。",
        category: "gameplay",
        effect: "none",
        output: "object",
        positionals: [
            {
                name: "course",
                valueName: "段位",
                description: "段位的名称或 id，例如 十段、真皆伝、551010",
            },
        ],
        examples: [
            { command: "course show 十段", description: "十段的血量规则和四首曲目" },
            {
                command: "course show 真九",
                description: "名字里有「真九」的只有真九段，所以不用写全",
            },
        ],
        errors: [
            "USAGE",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NETWORK",
            "UPSTREAM_ERROR",
            "OFFLINE_NO_CACHE",
        ],
        dataSchema: extend<CourseInfo & CourseTracks, CourseInfo>(
            courseInfoSchema,
            {
                tracks: list(courseTrackRowSchema, "段位曲目谱面列表，按出场顺序排列"),
                missing: list(
                    object<MissingCourseTrack>(
                        {
                            track: int("在段位中的出场顺序，从 1 开始"),
                            chartKey: str("谱面 key"),
                            musicId: int("曲目 id"),
                            title: str("曲目标题"),
                            difficulty: strEnum(DIFFICULTY_LABELS, "难度"),
                        },
                        { description: "未收录的段位曲目" }
                    ),
                    "曲库中未收录的段位曲目列表"
                ),
            },
            { description: "一个段位的血量规则和曲目" }
        ),
    },
    async (args, ctx) => {
        // The courses ship with the CLI, so a wrong name fails before anything is fetched.
        const course = resolveCourse(args.positionals.course);
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const { tracks, missing } = courseTracks(course, buildSongCatalog(metadata.catalog.music));
        return {
            data: { ...courseInfo(course), tracks, missing },
            meta: { dataAsOf: metadata.dataAsOf },
            warnings: metadata.warnings,
        };
    }
);
