import { chartRow } from "../catalog/chartRow";
import { chartRowSchema, relatedSchema, songTypeSchema } from "../catalog/schemas";
import { buildSongCatalog, songCharts, songType } from "../catalog/songs";
import { int, list, nullable, num, object, str } from "../output/schema";
import { resolveSong } from "../refs/song";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";
import { loadRelated, withOptions } from "./withRelated";

export const song = defineCommand(
    {
        name: "song",
        summary: "一首歌的基本信息和所有谱面",
        description:
            "曲目可以写曲目 id、谱面 key、标题、别名，也可以写搜索文本（标题或别名里的一段，简繁、拼音、罗马音都行）；标题和别名先按原样比，再忽略大小写和全半角，最后才搜索，每一步必须恰好找到一首，多首是 AMBIGUOUS_REF。标题是纯数字的歌会被当成 id，要先用 search 找。charts 里每个谱面是统一的谱面行，SD 在前，各自从易到难。" +
            "加 --with related 会多一个 related：用到这首歌的收藏品、段位和门，这首歌的任何一张谱用到都算（SD 和 DX 是两面，条件点名哪一面就是哪一面）。related.collections 里每个是 collection list 里的那一行，再加 requirements：只列点名了这首歌的条件，每条是 collection show 里的条件，再加 charts，也就是这条条件对这首歌的哪几张谱适用（谱面 key）；related.courses 里每个是 course list 里的那一行，再加 tracks（这首歌在这个段位里是第几首，track 从 1 起，加上谱面 key 和难度）；related.gates 里每个有 id、name、shortName、region、key（是不是钥匙条件点名的歌）和 pools（在哪几个曲池里，每个有 track 和 label）。三个列表的顺序和 collection list、course list、kaleidxscope 一样。收藏品要用落雪的列表，所以会和 collection list 一样联网取，meta.dataAsOf 里也多一个 collections；不写 --with related 就不取。",
        category: "catalog",
        effect: "none",
        output: "object",
        positionals: [
            {
                name: "song",
                valueName: "曲目",
                description: "曲目 id、谱面 key、标题、别名或搜索文本；含空格要加引号",
            },
        ],
        options: { ...withOptions() },
        examples: [
            { command: "song 146", description: "按曲目 id" },
            { command: "song 'True Love Song'", description: "按标题" },
            {
                command: "song 146 --with related",
                description: "再加上用到这首歌的收藏品、段位和门",
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
        dataSchema: object(
            {
                musicId: int("曲目 id；DX 谱的 id 是 SD 谱的 id 加 10000"),
                title: str("标题"),
                artist: str("曲师"),
                genre: str("流派"),
                bpm: nullable(num("曲目 BPM"), "曲目 BPM；没有 BPM（宴谱）时为 null"),
                aliases: list(str("别名"), "这首歌的别名列表"),
                type: songTypeSchema,
                charts: list(chartRowSchema, "这首歌的所有谱面，SD 在前，各自从易到难"),
                related: relatedSchema,
            },
            {
                description: "一首歌的基本信息和所有谱面",
                optional: ["related"],
            }
        ),
    },
    async (args, ctx) => {
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const found = resolveSong(buildSongCatalog(metadata.catalog.music), args.positionals.song);
        const charts = songCharts(found);
        // The collections are fetched only now: a song that cannot be found costs no download.
        const related = await loadRelated(args, ctx, charts);
        return {
            data: {
                musicId: found.musicId,
                title: found.title,
                artist: found.artist,
                genre: found.genre,
                bpm: found.bpm,
                aliases: found.aliases,
                type: songType(found),
                charts: charts.map(chart => chartRow({ chart, song: found })),
                ...(related && { related: related.data }),
            },
            meta: { dataAsOf: { ...metadata.dataAsOf, ...related?.dataAsOf } },
            warnings: [...metadata.warnings, ...(related?.warnings ?? [])],
        };
    }
);
