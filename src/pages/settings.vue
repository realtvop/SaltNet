<template>
    <div class="settings">
        <s-card type="filled" class="settings-item">
            <h2>数据</h2>
            <br />
            <div class="btns-container">
                <s-button type="filled-tonal" @click="userData.import">导入</s-button>
                <s-button type="filled-tonal" @click="userData.export">导出</s-button>
            </div>
        </s-card>
        <s-card type="filled" class="settings-item">
            <h2>缓存</h2>
            <br />
            <div class="btns-container">
                <s-button type="filled-tonal" @click="deleteCache('Covers')">清除缓存图片</s-button>
            </div>
        </s-card>
    </div>
</template>

<script setup lang="ts">
    import { useShared } from "@/components/app/shared";
    import { showSnackbar } from "@/components/app/utils";

    const shared = useShared();

    // Create a simple confirm dialog using Sober
    function showConfirm(message: string): Promise<boolean> {
        return new Promise(resolve => {
            const dialog = document.createElement("s-dialog");
            dialog.innerHTML = `
                <div slot="header">确认</div>
                <div>${message}</div>
                <div slot="action">
                    <s-button id="confirm-cancel" type="text">取消</s-button>
                    <s-button id="confirm-ok" type="filled">确认</s-button>
                </div>
            `;
            document.body.appendChild(dialog);

            const cancelBtn = dialog.querySelector("#confirm-cancel");
            const okBtn = dialog.querySelector("#confirm-ok");

            cancelBtn?.addEventListener("click", () => {
                (dialog as any).close();
                document.body.removeChild(dialog);
                resolve(false);
            });

            okBtn?.addEventListener("click", () => {
                (dialog as any).close();
                document.body.removeChild(dialog);
                resolve(true);
            });

            (dialog as any).show();
        });
    }

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
                    showSnackbar({
                        message: "导入成功，正在同步曲目数据...",
                        duration: 500,
                    });
                } catch (err) {
                    showSnackbar({
                        message: "导入失败，文件格式错误或数据损坏",
                        duration: 1000,
                    });
                }
            };
            input.click();
        },
        export: () => {
            showSnackbar({
                message: "正在导出",
                duration: 500,
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

                showSnackbar({
                    message: "已导出",
                    duration: 500,
                });
            } else {
                showSnackbar({
                    message: "没有数据可导出",
                    duration: 500,
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
        Covers: "图片资源",
    };
    async function deleteCache(key: keyof typeof displayName) {
        const confirmed = await showConfirm(
            `清除缓存的${displayName[key]}？\n数据删除后将无法恢复`
        );
        if (confirmed) {
            try {
                await caches.delete(`SaltNetv0-${key}`);
                showSnackbar({
                    message: `已清除缓存的${displayName[key]}`,
                    duration: 500,
                });
            } catch {
                showSnackbar({
                    message: `清除缓存的${displayName[key]}失败`,
                    duration: 500,
                });
            }
        }
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
