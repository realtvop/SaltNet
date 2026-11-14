import { searchItemSchema } from "../catalog/schemas";
import { searchSongs } from "../catalog/search";
import { buildSongCatalog, songType } from "../catalog/songs";
import { usageError } from "../errors";
import { paginate } from "../output/paging";
import { list, object } from "../output/schema";
import { listOptions } from "./listOptions";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";

/** `search` shows a few songs unless asked for more: it is what to run when unsure which song. */
const DEFAULT_SEARCH_LIMIT = 10;

export const search = defineCommand(
    {
        name: "search",
        summary: "按标题、别名、拼音、罗马音、曲师、谱师或 id 搜歌",
        description:
            "返回最相关的歌，最好的在前。每首歌的 matchedBy 说明文本是怎么找到它的：id（曲目 id）、title（标题）、alias（别名）、pinyin（拼音或首字母）、romaji（罗马音）、artist（曲师）、charter（谱师）。简体和繁体、全角和半角、大小写、空格和标点都不影响匹配。标题或别名恰好是这段文本的歌排在最前面；文本是数字时，曲目 id 和标题是这个数字的歌都会找到。",
        category: "catalog",
        effect: "none",
        output: "list",
        positionals: [
            {
                name: "text",
                valueName: "文本",
                description: "要搜的文本；多个词会用空格连起来，不用加引号",
                variadic: true,
            },
        ],
        options: { ...listOptions(DEFAULT_SEARCH_LIMIT) },
        examples: [
            { command: "search 世界计划", description: "按标题搜" },
            { command: "search sjjh", description: "按拼音首字母搜" },
            { command: "search true love --limit 3", description: "多个词，只要前三首" },
        ],
        errors: ["USAGE", "NETWORK", "UPSTREAM_ERROR", "OFFLINE_NO_CACHE"],
        dataSchema: object(
            { items: list(searchItemSchema, "搜到的歌，最相关的在前") },
            { description: "搜索结果" }
        ),
    },
    async (args, ctx) => {
        const text = args.positionals.text.join(" ").trim();
        if (!text) throw usageError("search 需要一段要搜的文本");

        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const matches = searchSongs(buildSongCatalog(metadata.catalog.music), text);
        const { items, page } = paginate(
            matches.map(({ song, matchedBy }) => ({
                musicId: song.musicId,
                title: song.title,
                artist: song.artist,
                genre: song.genre,
                type: songType(song),
                matchedBy,
            })),
            args.options
        );

        return {
            data: { items },
            meta: { dataAsOf: metadata.dataAsOf, page },
            warnings: metadata.warnings,
        };
    }
);
