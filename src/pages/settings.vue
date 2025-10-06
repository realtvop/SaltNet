<template>
    <div class="settings">
        <mdui-card variant="filled" class="settings-item">
            <h2>{{ $t("settings.language") }}</h2>
            <br />
            <mdui-select v-model="currentLocale">
                <mdui-menu-item
                    v-for="locale in availableLocales"
                    :key="locale.code"
                    :value="locale.code"
                    @click="handleLocaleChange(locale.code)"
                >
                    {{ locale.name }}
                </mdui-menu-item>
            </mdui-select>
        </mdui-card>
        <mdui-card variant="filled" class="settings-item">
            <h2>{{ $t("settings.data") }}</h2>
            <br />
            <div class="btns-container">
                <mdui-button variant="tonal" @click="userData.import">
                    {{ $t("settings.import") }}
                </mdui-button>
                <mdui-button variant="tonal" @click="userData.export">
                    {{ $t("settings.export") }}
                </mdui-button>
            </div>
        </mdui-card>
        <mdui-card variant="filled" class="settings-item">
            <h2>{{ $t("settings.cache") }}</h2>
            <br />
            <div class="btns-container">
                <mdui-button variant="tonal" @click="deleteCache('Covers')">
                    {{ $t("settings.clearCacheImages") }}
                </mdui-button>
            </div>
        </mdui-card>
    </div>
</template>

<script setup lang="ts">
    import { ref } from "vue";
    import { useI18n } from "vue-i18n";
    import { useShared } from "@/components/app/shared";
    import { snackbar, confirm } from "mdui";
    import { setLocale, getLocale, availableLocales } from "@/i18n";

    const shared = useShared();
    const { t } = useI18n();
    const currentLocale = ref(getLocale());

    function handleLocaleChange(locale: string) {
        setLocale(locale);
        currentLocale.value = locale;
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
                    snackbar({
                        message: t("settings.importSuccess"),
                        autoCloseDelay: 500,
                    });
                } catch (err) {
                    snackbar({
                        message: t("settings.importFailed"),
                        autoCloseDelay: 1000,
                    });
                }
            };
            input.click();
        },
        export: () => {
            snackbar({
                message: t("settings.exporting"),
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
                    message: t("settings.exported"),
                    autoCloseDelay: 500,
                });
            } else {
                snackbar({
                    message: t("settings.noDataToExport"),
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
        Covers: "imageResources",
    };
    function deleteCache(key: keyof typeof displayName) {
        const cacheName = t(`settings.${displayName[key]}`);
        confirm({
            headline: t("settings.confirmClearCache", { name: cacheName }),
            description: "数据删除后将无法恢复",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onConfirm: () =>
                caches
                    .delete(`SaltNetv0-${key}`)
                    .then(() => {
                        snackbar({
                            message: t("settings.cacheCleared", { name: cacheName }),
                            autoCloseDelay: 500,
                        });
                    })
                    .catch(() => {
                        snackbar({
                            message: `清除缓存的${cacheName}失败`,
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
