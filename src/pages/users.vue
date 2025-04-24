<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router'; // Import useRouter
// Use default imports for Vue components
import RatingPlate from '@/components/RatingPlate.vue';
import BindUserDialog from '@/components/users/BindUserDialog.vue';
import ConfirmDeleteDialog from '@/components/users/ConfirmDeleteDialog.vue'; // Import ConfirmDeleteDialog
// Correct the import path for the User type
import type { User } from '@/types/user';
import { updateUser } from '@/utils/updateUser';
import localForage from "localforage";

const users = ref<User[]>([]);

localForage.getItem<User[]>("users").then(v => {
    if (Array.isArray(v)) users.value = v;
});

watch(users, v => {
    localForage.setItem("users", JSON.parse(JSON.stringify(v)));
}, { deep: true });

const isDialogVisible = ref(false);
const isDeleteDialogVisible = ref(false); // Add ref for delete dialog visibility
const currentUserToEdit = ref<User | null>(null);
const editingUserIndex = ref<number | null>(null); // Add ref for index

const router = useRouter(); // Get router instance

// Update openEditDialog to accept and store the index
const openEditDialog = (user: User, index: number) => {
    // Perform a deep copy instead of assigning by reference
    currentUserToEdit.value = JSON.parse(JSON.stringify(user));
    editingUserIndex.value = index; // Store the index
    isDialogVisible.value = true;
};

const openAddDialog = () => {
    currentUserToEdit.value = {
        divingFish: { name: null, importToken: null },
        inGame: { name: null, id: null },
        data: {},
    };
    editingUserIndex.value = null;
    isDialogVisible.value = true;
};

const openDeleteDialog = (index: number) => {
    editingUserIndex.value = index;
    isDeleteDialogVisible.value = true;
};

const goToUserDetails = (index: number) => {
    router.push(`/b50/${index}`);
};

interface UpdatedUserData {
    divingFish: { name: string | null, importToken: string | null };
    inGame: { name: string | null; id: number | null };
}

// Update handleUserSave to use the stored index
const handleUserSave = (updatedUserData: UpdatedUserData) => {
    if (editingUserIndex.value === null) {
        users.value.push({
            divingFish: { name: updatedUserData.divingFish.name, importToken: updatedUserData.divingFish.importToken },
            inGame: { name: updatedUserData.inGame.name, id: updatedUserData.inGame.id },
            data: {},
        });
        currentUserToEdit.value = null;
        isDialogVisible.value = false;
        return;
    }

    const index = editingUserIndex.value;

    if (index >= 0 && index < users.value.length) {
        const originalUser = users.value[index];
        // Update the user in the array directly using the index
        users.value[index] = {
            ...originalUser,
            divingFish: {
                ...originalUser.divingFish,
                name: updatedUserData.divingFish.name,
                importToken: updatedUserData.divingFish.importToken,
            },
            inGame: {
                ...originalUser.inGame,
                id: updatedUserData.inGame.id, // Only update ID from dialog
            }
        };
    } else {
        console.warn("Invalid user index for update:", index);
    }

    // Reset state and close dialog
    currentUserToEdit.value = null;
    editingUserIndex.value = null; // Reset the index
    isDialogVisible.value = false;
};

const handleUserDelete = () => {
    if (editingUserIndex.value !== null && editingUserIndex.value >= 0 && editingUserIndex.value < users.value.length) {
        users.value.splice(editingUserIndex.value, 1);
    }
    currentUserToEdit.value = null;
    editingUserIndex.value = null;
    isDialogVisible.value = false;
    isDeleteDialogVisible.value = false; // Close delete dialog
};

const setAsDefault = (index: number) => {
    if (index > 0 && index < users.value.length) {
        const user = users.value.splice(index, 1)[0];
        users.value.unshift(user);
    }
};

function updateAll() {
    users.value.forEach(user => {
        updateUser(user);
    });
}
</script>

<template>
    <div style="height: 10px;"></div>
    <div class="user-cards-container">
        <!-- Pass index to openEditDialog -->
        <mdui-card
            :variant="index ? 'elevated' : 'filled'"
            v-for="(user, index) in users"
            :key="user.divingFish?.name || user.inGame?.id || index"
        >
            <div class="user-name">
                <div class="user-badges">
                    <h2 class="primary-name">{{ user.divingFish?.name ?? user.inGame?.name ?? "未知" }}</h2>
                    <RatingPlate v-if="user.data?.rating" :ra="user.data.rating"></RatingPlate>
                </div>
                <div class="user-badges">
                    <mdui-chip icon="videogame_asset" :disabled="!user.divingFish?.name">{{ user.divingFish?.name ?? "未绑定水鱼" }}</mdui-chip>
                    <mdui-chip icon="local_laundry_service" :disabled="!user.inGame?.id && !user.inGame?.name">{{ user.inGame?.name ?? user.inGame?.id ?? "未绑定游戏" }}</mdui-chip>
                </div>
            </div>
            <div class="user-actions">
                <!-- Pass index here -->
                <mdui-button-icon variant="standard" icon="update" @click="updateUser(user)"></mdui-button-icon>
                <mdui-dropdown>
                    <mdui-button-icon slot="trigger" icon="more_vert" style="margin-right: 10px;"></mdui-button-icon>
                    <mdui-menu>
                        <mdui-menu-item @click="openEditDialog(user, index)">
                            修改
                            <mdui-icon slot="icon" name="edit"></mdui-icon>
                        </mdui-menu-item>
                        <mdui-menu-item @click="setAsDefault(index)" v-if="index">
                            设为默认
                            <mdui-icon slot="icon" name="vertical_align_top"></mdui-icon>
                        </mdui-menu-item>

                        <mdui-divider />

                        <mdui-menu-item @click="openDeleteDialog(index)">
                            删除
                            <mdui-icon slot="icon" name="delete"></mdui-icon>
                        </mdui-menu-item>
                    </mdui-menu>
                </mdui-dropdown>
                <mdui-button end-icon="arrow_forward" @click="goToUserDetails(index)">详情</mdui-button>
            </div>
        </mdui-card>
    </div>

    <BindUserDialog
        v-model="isDialogVisible"
        :user="currentUserToEdit"
        @save="handleUserSave"
        @delete="handleUserDelete"
    />

    <ConfirmDeleteDialog
        v-model="isDeleteDialogVisible"
        @confirm="handleUserDelete"
    />

    <div class="fab-container">
        <mdui-fab icon="update" extended v-if="users.length" @click="updateAll">全部更新</mdui-fab>
        <mdui-fab icon="add" :extended="!users.length" @click="openAddDialog">添加用户</mdui-fab>
    </div>
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
    gap: 2.5px;

    padding-right: 20px;
}

.fab-container {
    position: fixed;
    right: 16px;
    display: flex;
    flex-direction: row-reverse;
    gap: 15px;

    @media (min-aspect-ratio: 1.001/1) {
        bottom: 16px;
    }
    @media (max-aspect-ratio: 0.999/1) or (aspect-ratio: 1/1) {
        bottom: 96px;
    }
}
</style>