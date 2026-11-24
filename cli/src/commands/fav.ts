import { chartRow } from "../catalog/chartRow";
import { chartRowSchema } from "../catalog/schemas";
import { buildSongCatalog } from "../catalog/songs";
import { usageError } from "../errors";
import {
    addChartToFavorite,
    createFavorite,
    deleteFavorite,
    getFavoriteByName,
    hasFavoriteName,
    listFavorites,
    removeChartFromFavorite,
    renameFavorite,
} from "../favorites/repository";
import { paginate } from "../output/paging";
import { bool, extend, int, list, object, str } from "../output/schema";
import { resolveChart } from "../refs/chart";
import { resolveFavorite } from "../refs/favorite";
import { CONFIRM_OPTIONS, requireConfirmation } from "./confirm";
import { USER_OPTION } from "./describe";
import { listOptions } from "./listOptions";
import { METADATA_ERRORS, useMetadata } from "./metadata";
import { defineCommand } from "./registry";
import { carryScoreContext, scoreMeta, useUserScores } from "./userScores";

const favoriteRowSchema = object(
    {
        name: str("收藏夹名称"),
        count: int("收藏夹里的曲目数量"),
        musicIds: list(int("曲目 id"), "收藏夹里的曲目 id 列表，按加入顺序排列"),
    },
    { description: "一个本地收藏夹" }
);

const removedFavoriteSchema = extend(
    favoriteRowSchema,
    { remainingFavorites: int("删除后还剩多少个收藏夹") },
    { description: "被删除的收藏夹和剩余收藏夹数" }
);

export const favList = defineCommand(
    {
        name: "fav list",
        summary: "按顺序列出全部本地收藏夹",
        description:
            "按创建顺序列出本地收藏夹，一行一个；每行有 name、count（条目数）和 musicIds（收藏的曲目 id 列表，按加入顺序排列）。不需要曲库，未下载时也可以离线运行。没有收藏夹时 items 是空数组。",
        category: "data",
        effect: "none",
        output: "list",
        options: { ...listOptions() },
        examples: [{ command: "fav list", description: "全部收藏夹" }],
        errors: ["USAGE", "DB_LOCKED"],
        dataSchema: object(
            { items: list(favoriteRowSchema, "按顺序排列的收藏夹列表") },
            { description: "本地收藏夹列表" }
        ),
    },
    (args, ctx) => {
        const store = ctx.store();
        const favorites = listFavorites(store);
        const { items, page } = paginate(
            favorites.map(fav => ({
                name: fav.name,
                count: fav.count,
                musicIds: [...fav.musicIds],
            })),
            args.options
        );
        return { data: { items }, meta: { page } };
    }
);

export const favCreate = defineCommand(
    {
        name: "fav create",
        summary: "创建一个新的本地收藏夹",
        description:
            "名称会自动去除首尾空白；不能为空，也不能和已有收藏夹重名。结果是新创建的收藏夹，格式和 fav list 一致。",
        category: "data",
        effect: "local",
        output: "object",
        positionals: [
            {
                name: "name",
                valueName: "名称",
                description: "收藏夹名称",
            },
        ],
        examples: [{ command: "fav create 待练", description: "创建名为「待练」的收藏夹" }],
        errors: ["USAGE", "DB_LOCKED"],
        dataSchema: favoriteRowSchema,
    },
    (args, ctx) => {
        const name = args.positionals.name.trim();
        if (name === "") {
            throw usageError("收藏夹名称不能为空");
        }
        const store = ctx.store();
        return store.transaction(() => {
            if (hasFavoriteName(store, name)) {
                throw usageError(`收藏夹「${name}」已存在`);
            }
            const fav = createFavorite(store, name);
            return {
                data: {
                    name: fav.name,
                    count: fav.count,
                    musicIds: [...fav.musicIds],
                },
            };
        });
    }
);

export const favRename = defineCommand(
    {
        name: "fav rename",
        summary: "重命名一个本地收藏夹",
        description:
            "新名称会自动去除首尾空白；不能为空，也不能和已有其他收藏夹重名（改回自己当前的名字会成功并不做任何改变）。结果是 previousName 和 name。",
        category: "data",
        effect: "local",
        output: "object",
        positionals: [
            {
                name: "favorite",
                valueName: "收藏夹",
                description: "收藏夹名称或模糊匹配",
            },
            {
                name: "newName",
                valueName: "新名称",
                description: "新的收藏夹名称",
            },
        ],
        examples: [
            { command: "fav rename 练习 备选", description: "把收藏夹「练习」重命名为「备选」" },
        ],
        errors: ["USAGE", "NOT_FOUND", "AMBIGUOUS_REF", "DB_LOCKED"],
        dataSchema: object(
            {
                previousName: str("原名称"),
                name: str("新名称"),
            },
            { description: "收藏夹重命名结果" }
        ),
    },
    (args, ctx) => {
        const newName = args.positionals.newName.trim();
        if (newName === "") {
            throw usageError("收藏夹名称不能为空");
        }
        const store = ctx.store();
        return store.transaction(() => {
            const favorites = listFavorites(store);
            const found = resolveFavorite(favorites, args.positionals.favorite);
            if (newName !== found.name && hasFavoriteName(store, newName)) {
                throw usageError(`收藏夹「${newName}」已存在`);
            }
            renameFavorite(store, found.id, newName);
            return {
                data: {
                    previousName: found.name,
                    name: newName,
                },
            };
        });
    }
);

export const favDelete = defineCommand(
    {
        name: "fav delete",
        summary: "确认后删除一个本地收藏夹",
        description:
            "先按当前数据返回退出码 6、删除预览和确认码；用户同意后运行 error.fix。确认码与收藏夹名称和其中的条目绑定，收藏夹内容发生变化后需要重新获取确认码。结果是删除前的收藏夹行，再加 remainingFavorites。",
        category: "data",
        effect: "local",
        output: "object",
        positionals: [
            {
                name: "favorite",
                valueName: "收藏夹",
                description: "收藏夹名称或模糊匹配",
            },
        ],
        options: { ...CONFIRM_OPTIONS },
        examples: [
            {
                command: "fav delete 练习",
                description: "预览删除收藏夹「练习」；确认后运行 error.fix",
            },
        ],
        errors: ["USAGE", "NOT_FOUND", "AMBIGUOUS_REF", "DB_LOCKED", "CONFIRMATION_REQUIRED"],
        dataSchema: removedFavoriteSchema,
    },
    (args, ctx) => {
        const store = ctx.store();
        return store.transaction(() => {
            const favorites = listFavorites(store);
            const found = resolveFavorite(favorites, args.positionals.favorite);
            const confirmArgs = found.name.startsWith("-")
                ? ["fav", "delete", "--", found.name]
                : ["fav", "delete", found.name];
            requireConfirmation(args.options.yes, {
                operation: "fav.delete",
                target: `fav:${found.name}`,
                state: {
                    name: found.name,
                    count: found.count,
                    musicIds: [...found.musicIds],
                    entries: found.entries.map(e => ({ musicId: e.musicId, grade: e.grade })),
                },
                preview: {
                    name: found.name,
                    count: found.count,
                    musicIds: [...found.musicIds],
                },
                summary: `将删除收藏夹「${found.name}」`,
                confirmArgs,
            });
            deleteFavorite(store, found.id);
            return {
                data: {
                    name: found.name,
                    count: found.count,
                    musicIds: [...found.musicIds],
                    remainingFavorites: favorites.length - 1,
                },
            };
        });
    }
);

export const favAdd = defineCommand(
    {
        name: "fav add",
        summary: "向本地收藏夹添加一张谱面所属的曲目",
        description:
            "收藏夹按曲目收藏，一张谱面会按它的曲目 id 加入收藏夹并记录当时选定的难度。如果收藏夹里已经有这首曲目，不会重复添加，added 为 false。谱面解析方式和 chart 命令一致。",
        category: "data",
        effect: "local",
        output: "object",
        positionals: [
            {
                name: "favorite",
                valueName: "收藏夹",
                description: "收藏夹名称或模糊匹配",
            },
            {
                name: "chart",
                valueName: "谱面",
                description: "谱面 key，或曲目 id、标题、别名（再给难度）",
            },
            {
                name: "difficulty",
                valueName: "难度",
                description: "难度；用谱面 key 时可以省略",
                optional: true,
            },
        ],
        options: {
            type: {
                kind: "enum",
                values: ["sd", "dx"],
                description:
                    "标题或别名两面都有这个难度时，取哪一面；写 id 或谱面 key 时用来核对类型",
            },
            ...USER_OPTION,
        },
        examples: [
            {
                command: "fav add 练习 146-3",
                description: "向收藏夹「练习」添加谱面 146-3 所在曲目",
            },
        ],
        errors: ["USAGE", "NOT_FOUND", "AMBIGUOUS_REF", "NO_USER", "DB_LOCKED", ...METADATA_ERRORS],
        dataSchema: object(
            {
                favorite: favoriteRowSchema,
                chart: chartRowSchema,
                added: bool("是否实际新增了条目（已存在同曲目时为 false）"),
            },
            { description: "添加曲目到收藏夹的结果" }
        ),
    },
    async (args, ctx) => {
        // The favorite is local, so a name that matches none fails before anything is fetched.
        resolveFavorite(listFavorites(ctx.store()), args.positionals.favorite);
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const userScores = useUserScores(
            args,
            ctx,
            Object.values(metadata.catalog.music.chartList)
        );
        try {
            const entry = resolveChart(buildSongCatalog(metadata.catalog.music), {
                ref: args.positionals.chart,
                difficulty: args.positionals.difficulty,
                type: args.options.type,
            });
            const store = ctx.store();
            return store.transaction(() => {
                const favorites = listFavorites(store);
                const found = resolveFavorite(favorites, args.positionals.favorite);
                const added = addChartToFavorite(
                    store,
                    found.id,
                    entry.chart.music.id,
                    entry.chart.info.grade
                );
                const updated = getFavoriteByName(store, found.name);
                if (!updated) throw new Error("favorite disappeared after add");
                return {
                    data: {
                        favorite: {
                            name: updated.name,
                            count: updated.count,
                            musicIds: [...updated.musicIds],
                        },
                        chart: chartRow(entry, userScores.scores),
                        added,
                    },
                    meta: scoreMeta(userScores, metadata.dataAsOf),
                    warnings: [...metadata.warnings, ...userScores.warnings],
                };
            });
        } catch (error) {
            carryScoreContext(
                error,
                userScores,
                { dataAsOf: metadata.dataAsOf },
                metadata.warnings
            );
        }
    }
);

export const favRemove = defineCommand(
    {
        name: "fav remove",
        summary: "从本地收藏夹移除一张谱面所属的曲目",
        description:
            "按曲目 id 从收藏夹中删除对应条目。如果收藏夹里原本没有这首曲目，不会做任何修改，removed 为 false。谱面解析方式和 chart 命令一致。",
        category: "data",
        effect: "local",
        output: "object",
        positionals: [
            {
                name: "favorite",
                valueName: "收藏夹",
                description: "收藏夹名称或模糊匹配",
            },
            {
                name: "chart",
                valueName: "谱面",
                description: "谱面 key，或曲目 id、标题、别名（再给难度）",
            },
            {
                name: "difficulty",
                valueName: "难度",
                description: "难度；用谱面 key 时可以省略",
                optional: true,
            },
        ],
        options: {
            type: {
                kind: "enum",
                values: ["sd", "dx"],
                description:
                    "标题或别名两面都有这个难度时，取哪一面；写 id 或谱面 key 时用来核对类型",
            },
            ...USER_OPTION,
        },
        examples: [
            {
                command: "fav remove 练习 146-3",
                description: "从收藏夹「练习」移除谱面 146-3 所在曲目",
            },
        ],
        errors: ["USAGE", "NOT_FOUND", "AMBIGUOUS_REF", "NO_USER", "DB_LOCKED", ...METADATA_ERRORS],
        dataSchema: object(
            {
                favorite: favoriteRowSchema,
                chart: chartRowSchema,
                removed: bool("是否实际移除了条目（不存在同曲目时为 false）"),
            },
            { description: "从收藏夹移除曲目的结果" }
        ),
    },
    async (args, ctx) => {
        // The favorite is local, so a name that matches none fails before anything is fetched.
        resolveFavorite(listFavorites(ctx.store()), args.positionals.favorite);
        const metadata = await useMetadata(args, ctx, ["catalog"]);
        const userScores = useUserScores(
            args,
            ctx,
            Object.values(metadata.catalog.music.chartList)
        );
        try {
            const entry = resolveChart(buildSongCatalog(metadata.catalog.music), {
                ref: args.positionals.chart,
                difficulty: args.positionals.difficulty,
                type: args.options.type,
            });
            const store = ctx.store();
            return store.transaction(() => {
                const favorites = listFavorites(store);
                const found = resolveFavorite(favorites, args.positionals.favorite);
                const removed = removeChartFromFavorite(store, found.id, entry.chart.music.id);
                const updated = getFavoriteByName(store, found.name);
                if (!updated) throw new Error("favorite disappeared after remove");
                return {
                    data: {
                        favorite: {
                            name: updated.name,
                            count: updated.count,
                            musicIds: [...updated.musicIds],
                        },
                        chart: chartRow(entry, userScores.scores),
                        removed,
                    },
                    meta: scoreMeta(userScores, metadata.dataAsOf),
                    warnings: [...metadata.warnings, ...userScores.warnings],
                };
            });
        } catch (error) {
            carryScoreContext(
                error,
                userScores,
                { dataAsOf: metadata.dataAsOf },
                metadata.warnings
            );
        }
    }
);
