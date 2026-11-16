import type { User } from "@core/user/type";
import type { UserDetail, UserRow } from "../users/view";
import { createUserUid } from "@core/user/scoreHistory/userIdentity";
import { userCountsSchema, userRowSchema } from "../catalog/schemas";
import { usageError } from "../errors";
import { paginate } from "../output/paging";
import { extend, int, list, object } from "../output/schema";
import { resolveUser } from "../refs/user";
import {
    listUsers,
    makeDefaultUser,
    readUser,
    readUserCounts,
    readUserRemovalFingerprint,
    removeUser,
    saveUser,
} from "../users/repository";
import { userDetail, userRow } from "../users/view";
import { CONFIRM_OPTIONS, requireConfirmation } from "./confirm";
import { listOptions } from "./listOptions";
import { defineCommand } from "./registry";

const USER_POSITIONAL = {
    name: "user",
    valueName: "用户",
    description: "用户序号（从 0 开始）、uid 或显示名",
} as const;

const OPTIONAL_USER_POSITIONAL = { ...USER_POSITIONAL, optional: true } as const;

const USER_REFERENCE_ERRORS = ["NOT_FOUND", "AMBIGUOUS_REF", "DB_LOCKED"] as const;

const userDetailSchema = extend<UserDetail, UserRow>(
    userRowSchema,
    { counts: userCountsSchema },
    { description: "一个本地用户及其拥有的各类数据行数" }
);

interface RemovedUser extends UserDetail {
    remainingUsers: number;
}

interface DefaultUser extends UserRow {
    previousIndex: number;
}

function removalUser(
    users: ReturnType<typeof listUsers>,
    text: string,
    confirmationCode: string | undefined
) {
    // Normal digit-only references are indexes. A confirmation fix is required to use the stable
    // uid, so its exact uid wins even when an imported uid happens to contain only digits.
    if (confirmationCode !== undefined) {
        const byUid = users.find(user => user.uid === text.trim());
        if (byUid) return byUid;
    }
    return resolveUser(users, text);
}

function nonBlankRemark(value: string | undefined): string | undefined {
    if (value !== undefined && value.trim() === "") {
        throw usageError("选项 --remark 的值不能是空字符串或只有空白");
    }
    return value;
}

function freshUser(remark: string | undefined, manualUpdate: boolean): User {
    return {
        uid: createUserUid(),
        remark: remark ?? null,
        divingFish: { name: null, importToken: null },
        lxns: { auth: null, name: null, id: null },
        inGame: { id: null, enabled: false, useFastUpdate: false },
        settings: { manuallyUpdate: manualUpdate },
        data: { updateTime: null, name: null, rating: null },
    };
}

export const userList = defineCommand(
    {
        name: "user list",
        summary: "按顺序列出全部本地用户",
        description:
            "按网页端的用户顺序列出全部用户，index 0 是默认用户。每行都有 uid、显示名、备注名、上次更新得到的游戏名、rating 和时间、手动更新开关，以及舞萌、落雪和水鱼绑定的非凭据部分；不会输出 token。没有用户时 items 是空数组。",
        category: "account",
        effect: "none",
        output: "list",
        options: { ...listOptions() },
        examples: [
            { command: "user list", description: "全部用户" },
            {
                command: "user list --fields index,uid,name,rating --format tsv",
                description: "只看序号、uid、显示名和 rating，输出成表格",
            },
        ],
        errors: ["USAGE", "DB_LOCKED"],
        dataSchema: object(
            { items: list(userRowSchema, "按顺序排列的用户列表") },
            { description: "本地用户列表" }
        ),
    },
    (args, ctx) => {
        const { items, page } = paginate(listUsers(ctx.store()), args.options);
        return { data: { items: items.map(userRow) }, meta: { page } };
    }
);

export const userShow = defineCommand(
    {
        name: "user show",
        summary: "查看一个用户及其本地数据行数",
        description:
            "用户可以写序号、uid 或显示名；省略时查看 index 0 的默认用户，没有任何用户时是 NO_USER。结果是 user list 的一行，再加 counts：详细成绩、B50、收藏品、旅行伙伴、rating 历史和成绩变化事件各有多少行。",
        category: "account",
        effect: "none",
        output: "object",
        positionals: [OPTIONAL_USER_POSITIONAL],
        examples: [
            { command: "user show", description: "默认用户及其数据量" },
            { command: "user show 1", description: "序号为 1 的用户" },
        ],
        errors: ["USAGE", "NO_USER", ...USER_REFERENCE_ERRORS],
        dataSchema: userDetailSchema,
    },
    (args, ctx) => {
        const store = ctx.store();
        return store.read(() => {
            const found = resolveUser(listUsers(store), args.positionals.user);
            return { data: userDetail(found, readUserCounts(store, found.uid)) };
        });
    }
);

export const userAdd = defineCommand(
    {
        name: "user add",
        summary: "追加一个尚未绑定数据来源的新用户",
        description:
            "在用户列表末尾追加一个用户，uid 每次新建，舞萌、落雪和水鱼都未绑定，成绩和更新时间为空。--remark 是显示用的备注名，不能是空字符串或只有空白；--manual-update 让 sync --all 跳过这个用户。结果是新用户在 user list 里的那一行。",
        category: "account",
        effect: "local",
        output: "object",
        options: {
            remark: {
                kind: "string",
                valueName: "名字",
                allowEmpty: true,
                description: "显示用的备注名；不能是空字符串或只有空白",
            },
            manualUpdate: {
                kind: "boolean",
                description: "只手动更新，让 sync --all 跳过这个用户",
            },
        },
        examples: [
            { command: "user add --remark 新玩家", description: "追加一个有备注名的用户" },
            {
                command: "user add --remark 手动玩家 --manual-update",
                description: "追加一个只手动更新的用户",
            },
        ],
        errors: ["USAGE", "DB_LOCKED"],
        dataSchema: userRowSchema,
    },
    (args, ctx) => {
        const made = freshUser(nonBlankRemark(args.options.remark), args.options.manualUpdate);
        const store = ctx.store();
        return store.transaction(() => {
            saveUser(store, made);
            const saved = listUsers(store).find(user => user.uid === made.uid);
            if (!saved) throw new Error("new user was not saved");
            return { data: userRow(saved) };
        });
    }
);

export const userEdit = defineCommand(
    {
        name: "user edit",
        summary: "只修改用户的备注名或手动更新开关",
        description:
            "只改 remark 和 settings.manuallyUpdate，用户对象里的绑定、成绩和其他字段原样保留。--clear-remark 把备注名改成 null；--manual-update 打开手动更新，--no-manual-update 关闭。必须至少写一种修改；--remark 不能留空，也不能和 --clear-remark 一起写。结果是修改后 user list 里的那一行。",
        category: "account",
        effect: "local",
        output: "object",
        positionals: [USER_POSITIONAL],
        options: {
            remark: {
                kind: "string",
                valueName: "名字",
                allowEmpty: true,
                description: "新的备注名；不能是空字符串或只有空白",
            },
            clearRemark: { kind: "boolean", description: "清除备注名" },
            manualUpdate: {
                kind: "boolean",
                optional: true,
                description: "打开或关闭只手动更新；关闭写 --no-manual-update",
            },
        },
        examples: [
            { command: "user edit 0 --remark 主玩家", description: "修改默认用户的备注名" },
            {
                command: "user edit 1 --manual-update",
                description: "让序号为 1 的用户只手动更新",
            },
        ],
        errors: ["USAGE", ...USER_REFERENCE_ERRORS],
        dataSchema: userRowSchema,
    },
    (args, ctx) => {
        const remark = nonBlankRemark(args.options.remark);
        if (remark !== undefined && args.options.clearRemark) {
            throw usageError("--remark 和 --clear-remark 不能一起使用");
        }
        if (
            remark === undefined &&
            !args.options.clearRemark &&
            args.options.manualUpdate === undefined
        ) {
            throw usageError("user edit 至少要写 --remark、--clear-remark 或 --[no-]manual-update");
        }

        const store = ctx.store();
        return store.transaction(() => {
            const found = resolveUser(listUsers(store), args.positionals.user);
            const current = readUser(store, found.uid);
            if (!current) throw new Error("resolved user has no raw row");
            const updated: User = {
                ...current,
                ...(remark !== undefined
                    ? { remark }
                    : args.options.clearRemark
                      ? { remark: null }
                      : {}),
                ...(args.options.manualUpdate === undefined
                    ? {}
                    : {
                          settings: {
                              ...current.settings,
                              manuallyUpdate: args.options.manualUpdate,
                          },
                      }),
            };
            saveUser(store, updated);
            const saved = listUsers(store).find(user => user.uid === found.uid);
            if (!saved) throw new Error("edited user disappeared");
            return { data: userRow(saved) };
        });
    }
);

export const userRemove = defineCommand(
    {
        name: "user remove",
        summary: "确认后删除用户、成绩和成绩历史",
        description:
            "先按当前数据返回退出码 6、删除预览和确认码；用户同意后运行 error.fix。预览是 user show 的结果。确认命令固定用 uid，删除用户以及它的成绩、B50、收藏品、旅行伙伴、rating 历史和成绩变化事件；其他用户的序号会自动补齐。结果是删除前的用户行和 counts，再加 remainingUsers。",
        category: "account",
        effect: "local",
        output: "object",
        positionals: [USER_POSITIONAL],
        options: { ...CONFIRM_OPTIONS },
        examples: [
            {
                command: "user remove 1",
                description: "预览删除序号为 1 的用户；确认后运行 error.fix",
            },
        ],
        errors: ["USAGE", ...USER_REFERENCE_ERRORS, "CONFIRMATION_REQUIRED"],
        dataSchema: extend<RemovedUser, UserDetail>(
            userDetailSchema,
            { remainingUsers: int("删除后还剩多少个用户") },
            { description: "被删除的用户、删除的数据行数和剩余用户数" }
        ),
    },
    (args, ctx) => {
        const store = ctx.store();
        return store.transaction(() => {
            const users = listUsers(store);
            const found = removalUser(users, args.positionals.user, args.options.yes);
            const detail = userDetail(found, readUserCounts(store, found.uid));
            const confirmArgs = found.uid.startsWith("-")
                ? ["user", "remove", "--", found.uid]
                : ["user", "remove", found.uid];
            requireConfirmation(args.options.yes, {
                operation: "user.remove",
                target: `user:${found.uid}`,
                state: {
                    uid: detail.uid,
                    index: detail.index,
                    name: detail.name,
                    scoresUpdatedAt: detail.scoresUpdatedAt,
                    counts: { ...detail.counts },
                    contentFingerprint: readUserRemovalFingerprint(store, found.uid),
                },
                preview: {
                    ...detail,
                    inGame: { ...detail.inGame },
                    lxns: detail.lxns === null ? null : { ...detail.lxns },
                    divingFish: { ...detail.divingFish },
                    counts: { ...detail.counts },
                },
                summary: `将删除用户「${detail.name}」及其成绩和历史`,
                confirmArgs,
            });
            if (!removeUser(store, found.uid)) throw new Error("confirmed user disappeared");
            return { data: { ...detail, remainingUsers: users.length - 1 } };
        });
    }
);

export const userDefault = defineCommand(
    {
        name: "user default",
        summary: "把一个用户移到 index 0",
        description:
            "把指定用户移到 index 0，其他用户保持原来的相对顺序。已经是默认用户时也成功。结果是移动后 user list 里的那一行，再加 previousIndex（移动前的序号）。",
        category: "account",
        effect: "local",
        output: "object",
        positionals: [USER_POSITIONAL],
        examples: [{ command: "user default 1", description: "把序号为 1 的用户设为默认" }],
        errors: ["USAGE", ...USER_REFERENCE_ERRORS],
        dataSchema: extend<DefaultUser, UserRow>(
            userRowSchema,
            { previousIndex: int("移动前的用户序号；原本就是默认用户时是 0") },
            { description: "设为默认后的用户行和它原来的序号" }
        ),
    },
    (args, ctx) => {
        const store = ctx.store();
        return store.transaction(() => {
            const found = resolveUser(listUsers(store), args.positionals.user);
            makeDefaultUser(store, found.uid);
            const moved = listUsers(store).find(user => user.uid === found.uid);
            if (!moved) throw new Error("default user disappeared");
            return { data: { ...userRow(moved), previousIndex: found.index } };
        });
    }
);
