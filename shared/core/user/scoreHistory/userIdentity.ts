import type { User } from "../type";

export function createUserUid(): string {
    return (
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
}

export function ensureUniqueUserUids(users: User[], requireExisting = false): User[] {
    const seen = new Set<string>();
    return users.map(user => {
        const uid = typeof user.uid === "string" && user.uid.trim() ? user.uid : null;
        if (!uid && requireExisting) throw new Error("带历史记录的用户缺少 uid");
        if (uid && seen.has(uid) && requireExisting) {
            throw new Error("用户数据包含重复 uid");
        }
        let nextUid = uid && !seen.has(uid) ? uid : createUserUid();
        while (seen.has(nextUid)) nextUid = createUserUid();
        seen.add(nextUid);
        return { ...user, uid: nextUid };
    });
}

export function hasStrongIdentityChanged(existing: User, incoming: User): boolean {
    const oldInGame = existing.inGame?.id;
    const newInGame = incoming.inGame?.id;
    if (oldInGame && newInGame && oldInGame !== newInGame) return true;

    const oldLXNS = existing.lxns?.id;
    const newLXNS = incoming.lxns?.id;
    if (oldLXNS && newLXNS && oldLXNS !== newLXNS) return true;

    if (!oldInGame && !newInGame && !oldLXNS && !newLXNS) {
        const oldDivingFish = existing.divingFish?.name?.trim();
        const newDivingFish = incoming.divingFish?.name?.trim();
        return Boolean(oldDivingFish && newDivingFish && oldDivingFish !== newDivingFish);
    }
    return false;
}

export function resetUserForNewIdentity(user: User): User {
    return {
        ...user,
        uid: createUserUid(),
        data: {
            updateTime: null,
            name: null,
            rating: null,
        },
    };
}
