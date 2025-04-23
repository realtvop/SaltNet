<script setup lang="ts">
import { ref } from 'vue';
// Revert to default imports for SFCs with <script setup>
import RatingPlate from '../components/RatingPlate.vue';
import BindUserDialog from '../components/users/BindUserDialog.vue';
// Correct the import path for the User type
import type { User } from '../types/user';

const users = ref<User[]>([
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
        data: null,
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
        data: null,
    },
]);

const isDialogVisible = ref(false);
const currentUserToEdit = ref<User | null>(null);

const openEditDialog = (user: User) => {
    currentUserToEdit.value = JSON.parse(JSON.stringify(user));
    isDialogVisible.value = true;
};

interface UpdatedUserData {
    divingFish: { name: string | null };
    inGame: { name: string | null; id: number | null };
}

const handleUserSave = (updatedUserData: UpdatedUserData) => {
    if (!currentUserToEdit.value) return;

    const index = users.value.findIndex((u: User) =>
        (currentUserToEdit.value?.divingFish?.name && u.divingFish?.name === currentUserToEdit.value.divingFish.name) ||
        (currentUserToEdit.value?.inGame?.id && u.inGame?.id === currentUserToEdit.value.inGame.id) ||
        (u === currentUserToEdit.value)
    );

    if (index !== -1) {
        const originalUser = users.value[index];
        users.value[index] = {
            ...originalUser,
            divingFish: {
                ...originalUser.divingFish,
                name: updatedUserData.divingFish.name,
            },
            inGame: {
                ...originalUser.inGame,
                name: updatedUserData.inGame.name,
                id: updatedUserData.inGame.id,
            }
        };
    } else {
        console.warn("Could not find user to update:", currentUserToEdit.value);
    }
    currentUserToEdit.value = null;
    isDialogVisible.value = false;
};
</script>

<template>
    <div style="height: 10px;"></div>
    <div class="user-cards-container">
        <mdui-card variant="filled" v-for="(user, index) in users" :key="user.divingFish?.name || user.inGame?.id || index">
            <div class="user-name">
                <div class="user-badges">
                    <h2 class="primary-name">{{ user.divingFish?.name ?? user.inGame?.name ?? "未知" }}</h2>
                    <RatingPlate v-if="user.data?.rating" :ra="user.data.rating"></RatingPlate>
                </div>
                <div class="user-badges">
                    <mdui-chip icon="water_drop" elevated :disabled="!user.divingFish?.name">{{ user.divingFish?.name ?? "未绑定水鱼" }}</mdui-chip>
                    <mdui-chip icon="videogame_asset" elevated :disabled="!user.inGame?.id && !user.inGame?.name">{{ user.inGame?.name ?? user.inGame?.id ?? "未绑定游戏" }}</mdui-chip>
                </div>
            </div>
            <div class="user-actions">
                <mdui-button-icon variant="standard" icon="settings" @click="openEditDialog(user)"></mdui-button-icon>
                <mdui-button-icon variant="standard" icon="update"></mdui-button-icon>
                <mdui-button end-icon="arrow_forward">详情</mdui-button>
            </div>
        </mdui-card>
    </div>

    <BindUserDialog
        v-model="isDialogVisible"
        :user="currentUserToEdit"
        @save="handleUserSave"
    />
</template>

<style scoped>
.user-cards-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 20px;
}

mdui-card {
    width: 97.5%;
    margin-left: 1.25%;
    padding-left: 15px;
    align-items: center;

    display: flex;
    justify-content: space-between;
}

.user-name {
    display: flex;
    flex-direction: column;
    height: 100%;
    justify-content: space-evenly;
    align-items: flex-start;
    padding: 10px 0;
}
.primary-name {
    font-weight: 500;
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