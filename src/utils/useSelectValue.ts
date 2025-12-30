import type { Ref } from "vue";

/**
 * 处理选择器值变化的通用函数
 * 用于防止清空已选择的项目
 *
 * @param event - 选择器的 change 事件
 * @param currentValue - 当前值的 ref
 * @param transform - 可选的值转换函数
 */
export function handleSelectChange<T>(
    event: Event,
    currentValue: Ref<T>,
    transform?: (value: string) => T
): void {
    const target = event.target as HTMLSelectElement;

    if (target.value) {
        const newValue = transform ? transform(target.value) : (target.value as unknown as T);
        currentValue.value = newValue;
    }
    // 如果 target.value 为空，不做任何操作，保持原值
    // 这样可以阻止点击已选择项目时清空选择
}

/**
 * 处理数字类型选择器值变化
 * 自动将字符串值转换为数字
 *
 * @param event - 选择器的 change 事件
 * @param currentValue - 当前值的 ref（数字类型）
 * @param offset - 可选的偏移量（例如 -1 将 "1" 转换为 0）
 */
export function handleNumericSelectChange(
    event: Event,
    currentValue: Ref<number>,
    offset: number = 0
): void {
    handleSelectChange(event, currentValue, value => Number(value) + offset);
}
