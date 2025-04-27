<template>
  <mdui-dialog ref="dialogRef" headline="" description="" @close="handleClose" close-on-esc>
    <mdui-top-app-bar slot="header">
      <mdui-button-icon icon="close" @click="handleClose"></mdui-button-icon>
      <mdui-top-app-bar-title>编辑用户绑定</mdui-top-app-bar-title>
      <mdui-button variant="text" @click="handleSave">保存</mdui-button>
    </mdui-top-app-bar>

    <mdui-text-field
      v-if="localUser.divingFish"
      label="水鱼用户名"
      :value="localUser.divingFish.name ?? ''"
      @input="localUser.divingFish.name = $event.target.value || null"
      placeholder="留空表示未绑定"
      autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
    ></mdui-text-field>

    <mdui-text-field
      v-if="localUser.inGame"
      label="舞萌 UserID (神秘8位数字)"
      type="number"
      :value="localUser.inGame.id ?? ''"
      @input="localUser.inGame.id = $event.target.value ? parseInt($event.target.value) : null"
      placeholder="留空表示未绑定"
      autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
    ></mdui-text-field>

    <mdui-text-field
      v-if="localUser.divingFish && localUser.inGame && localUser.inGame.id"
      label="水鱼成绩导入 Token"
      :value="localUser.divingFish.importToken ?? ''"
      @input="localUser.divingFish.importToken = $event.target.value || null"
      helper="用于上传数据，若不绑定游戏则可以不填"
      autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
      clearable
    ></mdui-text-field>
  </mdui-dialog>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, defineEmits, nextTick } from "vue";
import type { User } from "@/types/user";

const props = defineProps<{
  modelValue: boolean;
  user: User | null;
}>();

const emit = defineEmits(["update:modelValue", "save", "delete"]);

const dialogRef = ref<any>(null);

const localUser = ref<Partial<User>>({});

watch(() => props.user, (newUser) => {
  if (newUser) {
    localUser.value = JSON.parse(JSON.stringify(newUser));
    if (!localUser.value.divingFish) {
        localUser.value.divingFish = { name: null, importToken: null };
    }
    if (!localUser.value.inGame) {
        localUser.value.inGame = { name: null, id: null };
    }
  } else {
    localUser.value = { divingFish: { name: null, importToken: null }, inGame: { name: null, id: null } };
  }
}, { immediate: true, deep: true });

watch(() => props.modelValue, async (newValue) => {
  await nextTick();
  if (dialogRef.value) {
    dialogRef.value.open = newValue;
  }
});

const handleClose = () => {
  emit("update:modelValue", false);
};

const handleSave = () => {
  emit("save", {
      divingFish: { name: localUser.value.divingFish?.name ?? null, importToken: localUser.value.divingFish?.importToken ?? null },
      inGame: { id: localUser.value.inGame?.id ?? null }
  });
  handleClose();
};
</script>

<style scoped>
mdui-text-field {
  display: block;
  margin-bottom: 16px;
}
</style>