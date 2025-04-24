<template>
  <mdui-dialog
    ref="dialogRef"
    close-on-overlay-click
    close-on-esc
    @close="handleClose"
  >
    <span slot="headline">删除绑定的用户？</span>
    <span slot="description">用户删除后无法恢复</span>

    <mdui-button slot="action" variant="text" @click="handleClose"
      >取消</mdui-button
    >
    <mdui-button slot="action" variant="tonal" @click="handleConfirm"
      >删除</mdui-button
    >
  </mdui-dialog>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, defineEmits, nextTick } from "vue";
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits(["update:modelValue", "confirm"]);
const dialogRef = ref<any>(null);

watch(
  () => props.modelValue,
  async (v) => {
    await nextTick();
    if (dialogRef.value) dialogRef.value.open = v;
  }
);

const handleClose = () => emit("update:modelValue", false);
const handleConfirm = () => {
  emit("confirm");
  handleClose();
};
</script>
