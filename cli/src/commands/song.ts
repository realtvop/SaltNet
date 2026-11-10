import { chartRow } from "../catalog/chartRow";
import { buildSongCatalog, songCharts, songType } from "../catalog/songs";
import { resolveSong } from "../refs/song";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";

export const song = defineCommand(
    {
        name: "song",
        summary: "一首歌的基本信息和所有谱面",
        description:
            "曲目可以写曲目 id、谱面 key、标题、别名，也可以写搜索文本（标题或别名里的一段，简繁、拼音、罗马音都行）；标题和别名先按原样比，再忽略大小写和全半角，最后才搜索，每一步必须恰好找到一首，多首是 AMBIGUOUS_REF。标题是纯数字的歌会被当成 id，要先用 search 找。charts 里每个谱面是统一的谱面行，SD 在前，各自从易到难。",
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
        examples: [
            { command: "song 146", description: "按曲目 id" },
            { command: "song 'True Love Song'", description: "按标题" },
        ],
        errors: [
            "USAGE",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NETWORK",
            "UPSTREAM_ERROR",
            "OFFLINE_NO_CACHE",
        ],
    },
    async (args, ctx) => {
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const found = resolveSong(buildSongCatalog(metadata.catalog.music), args.positionals.song);
        return {
            data: {
                musicId: found.musicId,
                title: found.title,
                artist: found.artist,
                genre: found.genre,
                bpm: found.bpm,
                aliases: found.aliases,
                type: songType(found),
                charts: songCharts(found).map(chart => chartRow({ chart, song: found })),
            },
            meta: { dataAsOf: metadata.dataAsOf },
            warnings: metadata.warnings,
        };
    }
);
