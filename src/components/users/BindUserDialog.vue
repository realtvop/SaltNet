<template>
  <mdui-dialog ref="dialogRef" headline="" description="" @close="handleClose" close-on-esc>
    <mdui-top-app-bar slot="header">
      <mdui-button-icon icon="close" @click="handleClose"></mdui-button-icon>
      <mdui-top-app-bar-title>编辑用户绑定</mdui-top-app-bar-title>
      <mdui-button variant="text" @click="handleSave">保存</mdui-button>
    </mdui-top-app-bar>

    <!-- Bind directly to localUser properties -->
    <mdui-text-field
      v-if="localUser.divingFish"
      label="Diving Fish 用户名"
      :value="localUser.divingFish.name ?? ''"
      @input="localUser.divingFish.name = $event.target.value || null"
      helper="留空表示未绑定"
    ></mdui-text-field>

    <mdui-text-field
      v-if="localUser.inGame"
      label="舞萌 UserID (神秘8位数字)"
      type="number"
      :value="localUser.inGame.id ?? ''"
      @input="localUser.inGame.id = $event.target.value ? parseInt($event.target.value) : null"
      helper="留空表示未绑定"
    ></mdui-text-field>
  </mdui-dialog>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, defineEmits, nextTick } from "vue";
import type { User } from "@/types/user";

const props = defineProps<{
  modelValue: boolean; // Controls dialog visibility
  user: User | null; // User data to edit
}>();

const emit = defineEmits(["update:modelValue", "save"]);

const dialogRef = ref<any>(null); // Ref for the mdui-dialog element

// Initialize localUser with a structure that reflects the prop, handling null
const localUser = ref<Partial<User>>({});

// Watch for changes in the user prop to update localUser
watch(() => props.user, (newUser) => {
  if (newUser) {
    // Deep copy the user prop to localUser when it changes
    localUser.value = JSON.parse(JSON.stringify(newUser));
    // Ensure nested objects exist if they might be null/undefined in the prop
    if (!localUser.value.divingFish) {
        localUser.value.divingFish = { name: null };
    }
    if (!localUser.value.inGame) {
        localUser.value.inGame = { name: null, id: null };
    }
  } else {
    // Reset if the user prop becomes null
    localUser.value = { divingFish: { name: null }, inGame: { name: null, id: null } };
  }
}, { immediate: true, deep: true }); // immediate: run on load, deep: watch nested changes

// Watch for changes in modelValue to open/close the dialog
watch(() => props.modelValue, async (newValue) => {
  await nextTick(); // Wait for the DOM to update
  if (dialogRef.value) {
    dialogRef.value.open = newValue;
  }
});

const handleClose = () => {
  emit("update:modelValue", false);
};

const handleSave = () => {
  // Emit only the necessary fields for update
  emit("save", {
      divingFish: { name: localUser.value.divingFish?.name ?? null },
      inGame: { id: localUser.value.inGame?.id ?? null }
  });
  handleClose(); // Close the dialog after saving
};
</script>

<style scoped>
mdui-text-field {
  display: block;
  margin-bottom: 16px;
}
</style>