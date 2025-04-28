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

    <div class="userid-textfield">
      <mdui-text-field
        v-if="localUser.inGame"
        label="舞萌 UserID (神秘8位数字)"
        placeholder="未绑定"
        type="password"
        :value="localUser.inGame.id ?? ''"
        @input="localUser.inGame.id = $event.target.value ? parseInt($event.target.value) : null"
        autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
        disabled
      ></mdui-text-field>
      <mdui-button-icon icon="edit" @click="bindInGame"></mdui-button-icon>
    </div>

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
import { prompt, snackbar } from "mdui";

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

function bindInGame() {
  prompt({
    headline: "绑定用户",
    description: "输入 UserID、二维码扫描结果或复制的二维码页面链接",
    confirmText: "绑定",
    cancelText: "取消",
    closeOnEsc: true,
    closeOnOverlayClick: true,
    onConfirm: async (value: string, dialog: any) => {
      if (value) {
        const id = parseInt(value);
        if (!isNaN(id)) {
          if (!localUser.value.inGame) localUser.value.inGame = { name: null, id: null };
          localUser.value.inGame.id = id;
          dialog.close();
        } else {
          if (value.startsWith("SGWCMAID") && value.length === 84) return await getUserIdFromQRCode(value);
          if (value.startsWith("http")) {
            const matches = value.match(/MAID.{0,76}/g);
            if (matches && matches[0]) return await getUserIdFromQRCode(matches[0]);
            else snackbar({
              message: "二维码/链接解析失败，请检查是否正确",
              autoCloseDelay: 1000,
            });
          }
          snackbar({
            message: "二维码/链接解析失败，请检查是否正确",
            autoCloseDelay: 1000,
          });
        }
      }
    },
  });
}

function getUserIdFromQRCode(qrCode: string) {
  qrCode = qrCode.slice(-64);
  return fetch('https://salt_api_backup.realtvop.top/getQRInfo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ qrCode })
  }).then(r => r.json())
  .then(data => {
    if (data.errorID === 0) {
      if (!localUser.value.inGame) localUser.value.inGame = { name: null, id: null };
      localUser.value.inGame.id = data.userID;
    } else {
      snackbar({
        message: "二维码/链接解析失败，请检查二维码是否正确",
        autoCloseDelay: 1000,
      });
    }
  });
}
</script>

<style scoped>
mdui-text-field {
  display: block;
  margin-bottom: 16px;
}

.userid-textfield {
  display: flex;
  align-items: center;
  width: 100%;
  margin-bottom: 16px;
}
.userid-textfield mdui-text-field {
  width: calc(100% - 3rem);
  margin-bottom: 0px;
  margin-right: 0.5rem;
}
</style>