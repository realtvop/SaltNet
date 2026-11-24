// 记录用户数据备份文件的格式：固定的用户、成绩历史和导出时间要编码成逐字节相同的 JSON，解码要还原出
// 同样的内容。下面两段 base64 是用 Node 的 Buffer 另外算出来的，不经过这里的编码函数。
import type { ScoreHistoryEventV1 } from "./scoreHistory/type";
import type { User } from "./type";
import { describe, expect, it } from "vitest";
import { ComboStatus, SyncStatus } from "../mai/types";
import { decodeUserDataBackup, encodeUserDataBackup } from "./backup";

const USERS_BASE64 =
    "W3sidWlkIjoidXNlci0xIiwiZGl2aW5nRmlzaCI6eyJuYW1lIjoi5rWL6K+V546p5a62In0sImluR2FtZSI6eyJpZCI6MTIzNDU2NzgsImVuYWJsZWQiOnRydWUsInVzZUZhc3RVcGRhdGUiOmZhbHNlfSwic2V0dGluZ3MiOnsibWFudWFsbHlVcGRhdGUiOmZhbHNlfSwiZGF0YSI6eyJ1cGRhdGVUaW1lIjoxNzAwMDAwMDAwMDAwLCJuYW1lIjoi77y077yl77yz77y0IiwicmF0aW5nIjoxNTAwMCwicmF0aW5nSGlzdG9yeSI6W3sidGltZSI6MTcwMDAwMDAwMDAwMCwicmF0aW5nIjoxNTAwMH1dfX0seyJ1aWQiOiJ1c2VyLTIiLCJkaXZpbmdGaXNoIjp7Im5hbWUiOm51bGx9LCJpbkdhbWUiOnsiaWQiOm51bGwsImVuYWJsZWQiOmZhbHNlLCJ1c2VGYXN0VXBkYXRlIjpmYWxzZX0sInNldHRpbmdzIjp7Im1hbnVhbGx5VXBkYXRlIjp0cnVlfSwiZGF0YSI6eyJ1cGRhdGVUaW1lIjpudWxsLCJuYW1lIjpudWxsLCJyYXRpbmciOm51bGwsInJhdGluZ0hpc3RvcnkiOltdfX1d";
const EVENTS_BASE64 =
    "W3siaWQiOiJldmVudC0xIiwic2NoZW1hVmVyc2lvbiI6MSwiZ2VuZXJhdGlvbklkIjoiZ2VuZXJhdGlvbiIsImJhdGNoSWQiOiJiYXRjaCIsInVzZXJVaWQiOiJ1c2VyLTEiLCJjaGFydEtleSI6IjEwMDAxLTMiLCJvYnNlcnZlZEF0IjoxMDAwLCJzZXF1ZW5jZSI6MCwic291cmNlIjoiaW5HYW1lIiwia2luZCI6ImluaXRpYWwiLCJjaGFuZ2VkTWFzayI6MCwic3RhdGUiOnsiYWNoaWV2ZW1lbnRzIjoxMDAuNSwiZHhTY29yZSI6MjUwMCwiZmMiOiJmYyIsImZzIjoiZnMiLCJwbGF5Q291bnQiOjEwfX1d";

// 已经是解码后的样子（带 enabled、useFastUpdate 和 ratingHistory），所以解码结果应当与它相等
function createUsers(): User[] {
    return [
        {
            uid: "user-1",
            divingFish: { name: "测试玩家" },
            inGame: { id: 12345678, enabled: true, useFastUpdate: false },
            settings: { manuallyUpdate: false },
            data: {
                updateTime: 1_700_000_000_000,
                name: "ＴＥＳＴ",
                rating: 15_000,
                ratingHistory: [{ time: 1_700_000_000_000, rating: 15_000 }],
            },
        },
        {
            uid: "user-2",
            divingFish: { name: null },
            inGame: { id: null, enabled: false, useFastUpdate: false },
            settings: { manuallyUpdate: true },
            data: { updateTime: null, name: null, rating: null, ratingHistory: [] },
        },
    ];
}

function createEvent(overrides: Partial<ScoreHistoryEventV1> = {}): ScoreHistoryEventV1 {
    return {
        id: "event-1",
        schemaVersion: 1,
        generationId: "generation",
        batchId: "batch",
        userUid: "user-1",
        chartKey: "10001-3",
        observedAt: 1_000,
        sequence: 0,
        source: "inGame",
        kind: "initial",
        changedMask: 0,
        state: {
            achievements: 100.5,
            dxScore: 2_500,
            fc: ComboStatus.FullCombo,
            fs: SyncStatus.FullSync,
            playCount: 10,
        },
        ...overrides,
    };
}

describe("user data backup format", () => {
    it("encodes fixed users and history into exactly this JSON", () => {
        const backup = encodeUserDataBackup(createUsers(), [createEvent()], 1_700_000_000_000);
        expect(JSON.stringify(backup)).toBe(
            `{"version":1,"exportedAt":1700000000000,"tip":"为简单保护用户id，以下内容使用base64编码","users":"${USERS_BASE64}","scoreHistory":{"schemaVersion":1,"encoding":"base64-json","eventCount":1,"data":"${EVENTS_BASE64}"}}`
        );
    });

    it("decodes what it encodes", () => {
        const users = createUsers();
        const events = [createEvent()];
        const backup = encodeUserDataBackup(users, events, 1_700_000_000_000);
        expect(decodeUserDataBackup(backup)).toEqual({ users, events });
        expect(createUsers()).toEqual(users);
        expect([createEvent()]).toEqual(events);
    });

    it("round-trips history longer than one encoding chunk", () => {
        const events = Array.from({ length: 400 }, (_, sequence) =>
            createEvent({ id: `event-${sequence}`, sequence })
        );
        expect(new TextEncoder().encode(JSON.stringify(events)).length).toBeGreaterThan(2 * 0x8000);
        const backup = encodeUserDataBackup(createUsers(), events, 0);
        expect(backup.scoreHistory?.eventCount).toBe(400);
        expect(decodeUserDataBackup(backup).events).toEqual(events);
    });
});
