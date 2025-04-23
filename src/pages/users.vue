<template>
    <div style="height: 10px;"></div>
    <mdui-card variant="filled">
        <div class="user-name">
            <h2 class="primary-name">realtvop</h2>
            <div class="user-badges">
                <mdui-chip icon="videogame_asset" elevated disabled>未绑定水鱼</mdui-chip>
                <mdui-chip icon="local_laundry_service" elevated>GUEST</mdui-chip>
            </div>
        </div>
        <div class="user-actions">
            <mdui-button end-icon="arrow_forward">详情</mdui-button>
            <!-- <mdui-button end-icon="settings">设置</mdui-button> -->
        </div>
    </mdui-card>
</template>

<script setup>
</script>

<style scoped>
mdui-card {
    width: 97.5%;
    /* height: 150px; */
    margin-left: 1.25%;
    padding-left: 15px;
    align-items: center;

    display: flex;
    justify-content: space-between;

    display: flex;
}

.user-name {
    /* flex: 1; */
    display: flex;
    flex-direction: column;
    height: 100%;
    justify-content: space-evenly;
    align-items: flex-start;
    padding: 10px 0;
}
.primary-name {
    font-weight: 450;
    margin-top: 0;
    margin-bottom: 5px;
}
.user-badges {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
}
mdui-chip {
    height: 28px;
}

.user-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 10px;
}

</style>