<template>
    <div class="settings">
        <mdui-card variant="filled" class="settings-item">
            <h2>数据</h2>
            <br />
            <div class="btns-container">
                <mdui-button variant="tonal" @click="userData.import">导入</mdui-button>
                <mdui-button variant="tonal" @click="userData.export">导出</mdui-button>
            </div>
        </mdui-card>
        <mdui-card variant="filled" class="settings-item">
            <h2>缓存</h2>
            <br />
            <div class="btns-container">
                <mdui-button variant="tonal" @click="deleteCache('Covers')">
                    清除缓存的曲绘
                </mdui-button>
            </div>
        </mdui-card>
    </div>
</template>

<script setup lang="ts">
    import { useShared } from "@/components/shared.vue";
    import { snackbar, confirm } from "mdui";

    const shared = useShared();

    const userData = {
        import: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.onchange = async (e: Event) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const decoded = userData.dataDecoder[0](data);
                    shared.users = decoded.users;
                    snackbar({
                        message: "导入成功，正在同步曲目数据...",
                        autoCloseDelay: 500,
                    });
                } catch (err) {
                    snackbar({
                        message: "导入失败，文件格式错误或数据损坏",
                        autoCloseDelay: 1000,
                    });
                }
            };
            input.click();
        },
        export: () => {
            snackbar({
                message: "正在导出",
                autoCloseDelay: 500,
            });
            if (shared.users) {
                const data = {
                    version: 0,
                    tip: "为简单保护用户id，以下内容使用base64编码",
                    users: btoa(unescape(encodeURIComponent(JSON.stringify(shared.users)))),
                };
                const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "SaltNet_用户数据.json";
                a.click();
                URL.revokeObjectURL(url);

                snackbar({
                    message: "已导出",
                    autoCloseDelay: 500,
                });
            } else {
                snackbar({
                    message: "没有数据可导出",
                    autoCloseDelay: 500,
                });
            }
        },
        dataDecoder: [
            (data: { users: string }) => {
                const users = JSON.parse(decodeURIComponent(escape(atob(data.users))));
                return {
                    users,
                };
            },
        ],
    };

    const displayName = {
        Covers: "曲绘",
    };
    function deleteCache(key: keyof typeof displayName) {
        confirm({
            headline: `清除缓存的${displayName[key]}？`,
            description: "数据删除后将无法恢复",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onConfirm: () =>
                caches
                    .delete(`SaltNetv0-${key}`)
                    .then(() => {
                        snackbar({
                            message: `已清除缓存的${displayName[key]}`,
                            autoCloseDelay: 500,
                        });
                    })
                    .catch(() => {
                        snackbar({
                            message: `清除缓存的${displayName[key]}失败`,
                            autoCloseDelay: 500,
                        });
                    }),
        });
    }
</script>

<style scoped>
    .settings {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 24px;
    }

    .settings-item {
        width: 1000px;
        max-width: 90%;
        padding: 15px 20px;
    }
    h2 {
        margin: 0;
    }
    .btns-container {
        display: flex;
        flex-direction: row-reverse;
        gap: 20px;
    }
</style>
