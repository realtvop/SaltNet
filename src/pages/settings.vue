<template>
    <div class="settings">
        <mdui-card variant="filled" class="settings-item">
            <h2>数据</h2>
            <br>
            <div class="btns-container">
                <mdui-button variant="tonal" @click="userData.import">导入</mdui-button>
                <mdui-button variant="tonal" @click="userData.export">导出</mdui-button>
            </div>
        </mdui-card>
    </div>
</template>

<script setup lang="ts">
import localforage from 'localforage';
import { snackbar } from 'mdui';

const userData = {
    import: () => {
        snackbar({
            message: "还在写哦",
            autoCloseDelay: 500,
        });
    },
    export: () => {
        snackbar({
            message: "正在导出",
            autoCloseDelay: 500,
        });
        localforage.getItem("users").then((v) => {
            if (v) {
                const data = {
                    version: 0,
                    users: btoa(unescape(encodeURIComponent(JSON.stringify(v)))),
                };

                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'SaltNet_用户数据.json';
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
        });
    },
    dataDecoder: [
        data => {
            const users = JSON.parse(unescape(atob(data.users)));
            return {
                users,
            };
        },
    ],
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