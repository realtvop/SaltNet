import type {
    CollectionDetail,
    CollectionRow,
    MissingCollectionSong,
} from "../catalog/collectionView";
import { allChartEntries } from "../catalog/chartQuery";
import {
    collectionChartEntries,
    collectionChartRow,
    collectionDetail,
    collectionRow,
    missingCollectionSongs,
} from "../catalog/collectionView";
import {
    collectionChartRowSchema,
    collectionRowSchema,
    requirementRowSchema,
} from "../catalog/schemas";
import { buildSongCatalog } from "../catalog/songs";
import { usageError } from "../errors";
import { paginate } from "../output/paging";
import { extend, int, list, object, str } from "../output/schema";
import { COLLECTION_KINDS, listCollections, resolveCollection } from "../refs/collection";
import { foldName } from "../util/fold";
import { listOptions } from "./listOptions";
import { useMetadata } from "./metadata";
import { defineCommand } from "./registry";

export const collectionList = defineCommand(
    {
        name: "collection list",
        summary: "列出收藏品：姓名框、称号、头像、背景、旅行伙伴、搭档",
        description:
            "列出收藏品，一行一个：姓名框（plate）、称号（title）、头像（icon）、背景（frame）、旅行伙伴（character）和搭档（partner）。前四类用落雪的数据，后两类随 CLI 带。顺序是类型（上面这个顺序）再按落雪列表里的顺序。每行有 ref（类型:id，例如 title:5108，可以直接给 collection show 和 charts --collection 用）、kind、id、name、genre（游戏里把它归在哪一类，搭档没有时是 null）、color（称号的稀有度 Normal、Bronze、Silver、Gold 或 Rainbow，其他类型是 null）、description（游戏里写的获取方式）、songCount（获取条件点名了几首歌，没有曲目条件的是 0），以及 owned 和 progress（用户的数据随后加入，现在恒为 null）。--kind 只要这几类，多个用逗号隔开；--search 按名称筛选，名称里含有这段文字就算，不分大小写和全半角，不做简繁转换。",
        category: "collection",
        effect: "none",
        output: "list",
        options: {
            kind: {
                kind: "list",
                item: { kind: "enum", values: COLLECTION_KINDS },
                valueName: "类型,类型",
                description:
                    "只要这些类型，多个用逗号隔开；对应的是 plate 姓名框、title 称号、icon 头像、frame 背景、character 旅行伙伴、partner 搭档",
            },
            search: {
                kind: "string",
                valueName: "文本",
                description: "只要名称里含有这段文字的收藏品",
            },
            ...listOptions(),
        },
        examples: [
            { command: "collection list --kind plate", description: "全部姓名框" },
            {
                command: "collection list --kind title --search 千本 --limit 5",
                description: "名称里有「千本」的称号",
            },
            {
                command:
                    "collection list --kind character,partner --fields ref,name,genre --format tsv",
                description: "旅行伙伴和搭档，只看 ref、名称和分类，输出成表格",
            },
        ],
        errors: ["USAGE", "NETWORK", "UPSTREAM_ERROR", "OFFLINE_NO_CACHE"],
        dataSchema: object(
            { items: list(collectionRowSchema, "符合条件的收藏品列表") },
            { description: "收藏品列表" }
        ),
    },
    async (args, ctx) => {
        const { kind, search } = args.options;
        const needle = search === undefined ? undefined : foldName(search.trim());
        if (needle === "") throw usageError("选项 --search 的值不能只有空白");

        const metadata = await useMetadata(args, ctx, ["collections"]);
        const kinds = kind && new Set<string>(kind);
        const matching = listCollections(metadata.collections.collections).filter(
            entry =>
                (!kinds || kinds.has(entry.kind)) &&
                (needle === undefined || foldName(entry.collection.name).includes(needle))
        );
        const { items, page } = paginate(matching, args.options);
        return {
            data: { items: items.map(collectionRow) },
            meta: { dataAsOf: metadata.dataAsOf, page },
            warnings: metadata.warnings,
        };
    }
);

export const collectionShow = defineCommand(
    {
        name: "collection show",
        summary: "一个收藏品的获取条件和它点名的谱面",
        description:
            "收藏品写成 类型:id（类型有 plate、title、icon、frame、character、partner，例如 title:5108）或完整的名称；名称重复时是 AMBIGUOUS_REF，候选的 ref 就是 类型:id；不做名称的一部分匹配。结果有三部分。collection 是 collection list 里的那一行，再加 requirements，也就是获取条件：每条有 difficulties（要求的难度，null 是任意难度都行）、rank、combo、sync（至少要达到什么，不要求的是 null；三个都是 null 表示打过就行）和 songCount（适用于几首歌）。items 是条件点名的谱面，每个是谱面行再加 done（用户的数据随后加入，现在恒为 null），顺序和 charts 一样（难度高的在前，同一难度里新曲在前），用 --limit 和 --offset 翻页，page.total 是一共几张。missing 是条件点名、曲库里没有的歌（国服没有的歌），每个有 musicId 和 title。没有曲目条件的收藏品（多数称号、头像和背景，旅行伙伴和搭档）items 是空的，获取条件只有 description 里的文字。要对这些谱面筛选、排序或分组，用 charts --collection。",
        category: "collection",
        effect: "none",
        output: "list",
        positionals: [
            {
                name: "collection",
                valueName: "收藏品",
                description: "类型:id 或完整的名称，例如 plate:6148、title:5102",
            },
        ],
        options: { ...listOptions() },
        examples: [
            { command: "collection show title:5102", description: "一个称号的条件和它要打的谱面" },
            {
                command: "collection show plate:6148 --limit 20 --offset 20",
                description: "一个牌子点名的谱面，看第二页",
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
                collection: extend<CollectionDetail, CollectionRow>(
                    collectionRowSchema,
                    {
                        requirements: list(requirementRowSchema, "获取条件列表"),
                    },
                    { description: "收藏品详情与获取条件" }
                ),
                missing: list(
                    object<MissingCollectionSong>(
                        {
                            musicId: int("曲目 id"),
                            title: str("曲目标题"),
                        },
                        { description: "未收录的曲目" }
                    ),
                    "条件点名但曲库中未收录的曲目列表"
                ),
                items: list(collectionChartRowSchema, "条件点名的谱面列表"),
            },
            { description: "一个收藏品的获取条件和它点名的谱面" }
        ),
    },
    async (args, ctx) => {
        // The collections come first: a name that is wrong or ambiguous costs no catalog download.
        const collectionData = await useMetadata(args, ctx, ["collections"]);
        const found = resolveCollection(
            listCollections(collectionData.collections.collections),
            args.positionals.collection
        );
        const metadata = await useMetadata(args, ctx, ["catalog"]);

        const catalog = buildSongCatalog(metadata.catalog.music);
        const { items, page } = paginate(
            collectionChartEntries(found.collection, allChartEntries(catalog)),
            args.options
        );
        return {
            data: {
                collection: collectionDetail(found),
                missing: missingCollectionSongs(found.collection, catalog),
                items: items.map(collectionChartRow),
            },
            // The catalog is listed first in both, as `charts` does.
            meta: { dataAsOf: { ...metadata.dataAsOf, ...collectionData.dataAsOf }, page },
            warnings: [...metadata.warnings, ...collectionData.warnings],
        };
    }
);
