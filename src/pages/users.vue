<script setup>
import RatingPlate from '../components/RatingPlate.vue';

const users = [
    {
        divingFish: {
            name: "realtvop",
            importToken: "sth",
        },
        inGame: {
            name: "realtvop",
            id: 10000000,
        },
        data: {
            rating: 11451,
        },
    },
    {
        divingFish: {
            name: null,
            importToken: null,
        },
        inGame: {
            name: "OnlyInGame",
            id: 10000000,
        },
    },
    {
        divingFish: {
            name: "OnlyDivingFish",
            importToken: null,
        },
        inGame: {
            name: null,
            id: null,
        },
    },
]
</script>

<template>
    <div style="height: 10px;"></div>
    <div class="user-cards-container">
        <mdui-card variant="filled" v-for="user in users">
            <div class="user-name">
                <div class="user-badges">
                    <h2 class="primary-name">{{ (user.divingFish && user.divingFish.name) ?? (user.inGame && user.inGame.name) ?? "未知" }}</h2>
                    <RatingPlate v-if="user.data && user.data.rating" :ra="user.data.rating"></RatingPlate>
                </div>
                <div class="user-badges">
                    <mdui-chip icon="videogame_asset" elevated :disabled="!user.divingFish || !user.divingFish.name">{{ user.divingFish.name ?? "未绑定水鱼" }}</mdui-chip>
                    <mdui-chip icon="local_laundry_service" elevated :disabled="!user.inGame || !user.inGame.id">{{ user.inGame.name ?? user.inGame.id ?? "未绑定游戏" }}</mdui-chip>
                </div>
            </div>
            <div class="user-actions">
                <mdui-button-icon variant="standard" icon="settings"></mdui-button-icon>
                <mdui-button-icon variant="standard" icon="update"></mdui-button-icon>
                <mdui-button end-icon="arrow_forward">详情</mdui-button>
                <!-- <mdui-button end-icon="settings">设置</mdui-button> -->
            </div>
        </mdui-card>
    </div>
</template>

<style scoped>
.user-cards-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

mdui-card {
    width: 97.5%;
    /* height: 150px; */
    margin-left: 1.25%;
    padding-left: 15px;
    align-items: center;

    display: flex;
    justify-content: space-between;
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