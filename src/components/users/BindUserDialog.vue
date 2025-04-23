<template>
  <mdui-dialog ref="dialogRef" headline="" description="" @close="handleClose">
    <mdui-top-app-bar slot="header">
      <mdui-button-icon icon="close" @click="handleClose"></mdui-button-icon>
      <mdui-top-app-bar-title>编辑用户绑定</mdui-top-app-bar-title>
      <mdui-button variant="text" @click="handleSave">保存</mdui-button>
    </mdui-top-app-bar>

    <!-- Description moved here -->
    <!-- <div style="margin-bottom: 16px;">修改用户的 Diving Fish 用户名和游戏内信息。</div> -->

    <!-- Data binding using v-model -->
    <mdui-text-field
      v-if="localUser.divingFish"
      label="Diving Fish 用户名"
      v-model="localUser.divingFish.name"
      helper="留空表示未绑定"
    ></mdui-text-field>
    <!-- <mdui-text-field
      v-if="localUser.inGame"
      label="游戏内昵称"
      v-model="localUser.inGame.name"
      helper="如果绑定了ID，昵称会自动获取"
    ></mdui-text-field> -->
    <mdui-text-field
      v-if="localUser.inGame"
      label="舞萌 UserID (神秘8位数字)"
      type="number"
      v-model="localUser.inGame.id"
      helper="留空表示未绑定"
    ></mdui-text-field>
  </mdui-dialog>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, defineEmits, nextTick } from "vue";
import type { User } from "../../types/user"; // Corrected path

const props = defineProps<{
  modelValue: boolean; // Controls dialog visibility
  user: User | null; // User data to edit
}>();

const emit = defineEmits(["update:modelValue", "save"]);

const dialogRef = ref<any>(null); // Ref for the mdui-dialog element
// Initialize with default structure matching User type
const localUser = ref<Partial<User>>({
  divingFish: { name: null },
  inGame: { name: null, id: null },
});

// Watch for changes in the user prop to update the local copy
watch(
  () => props.user,
  (newUser) => {
    if (newUser) {
      // Deep copy to avoid modifying the original object
      localUser.value = JSON.parse(JSON.stringify(newUser));
      // Ensure nested objects exist
      if (!localUser.value.divingFish) {
        localUser.value.divingFish = { name: null };
      }
      if (!localUser.value.inGame) {
        localUser.value.inGame = { name: null, id: null };
      }
    } else {
      // Reset when no user is provided
      localUser.value = {
        divingFish: { name: null },
        inGame: { name: null, id: null },
      };
    }
  },
  { immediate: true, deep: true }
);

// Watch for modelValue changes to control the dialog's open state
watch(
  () => props.modelValue,
  async (newValue) => {
    await nextTick(); // Wait for the DOM to update
    if (dialogRef.value) {
      dialogRef.value.open = newValue;
    }
  }
);

const handleClose = () => {
  emit("update:modelValue", false);
};

const handleSave = () => {
  const nameDF = localUser.value.divingFish?.name || null;
  const nameIG = localUser.value.inGame?.name || null;

  // Simplified ID check and assignment
  let idIG: number | null = null;
  const idValue = localUser.value.inGame?.id;
  if (
    idValue !== null &&
    idValue !== undefined &&
    String(idValue).trim() !== ""
  ) {
    idIG = Number(idValue);
  }

  // Define the structure for the emitted data
  const userToSave: {
    divingFish: { name: string | null };
    inGame: { name: string | null; id: number | null };
  } = {
    divingFish: {
      name: nameDF,
    },
    inGame: {
      name: nameIG,
      id: idIG,
    },
  };

  emit("save", userToSave);
  handleClose();
};
</script>

<style scoped>
mdui-text-field {
  display: block;
  margin-bottom: 16px;
}
</style>