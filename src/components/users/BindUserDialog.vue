<template>
  <mdui-dialog ref="dialogRef" headline="" description="" @close="handleClose" close-on-esc>
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
      :value="localUser.divingFish.name"
      @input="editedUser.divingFishName = $event.target.value"
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
      :value="localUser.inGame.id"
      @input="editedUser.inGameId = $event.target.value"
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

const editedUser = {
  divingFishName: null,
  inGameId: null,
};

const emit = defineEmits(["update:modelValue", "save"]);

const dialogRef = ref<any>(null); // Ref for the mdui-dialog element
// Initialize with default structure matching User type
const localUser = ref<Partial<User>>({
  divingFish: { name: null },
  inGame: { name: null, id: null },
});

const handleClose = () => {
  emit("update:modelValue", false);
};

const handleSave = () => {
  localUser.value.divingFish.name = editedUser.divingFishName;
  localUser.value.inGame.id = editedUser.inGameId;

  emit("save", localUser.value);
  handleClose();
};
</script>

<style scoped>
mdui-text-field {
  display: block;
  margin-bottom: 16px;
}
</style>