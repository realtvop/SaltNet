import { prompt } from "mdui";
import { useShared } from "@/components/app/shared";
import { markDialogClosed, markDialogOpen } from "@/components/app/router.vue";

export function setAPIKey(): Promise<string> {
    const shared = useShared();
    return prompt({
        headline: "设置 nearcade API Key",
        description: "请前往 nearcade 官网获取 API Key",
        textFieldOptions: {
            value: shared.nearcadeData.APIKey || "",
        },
        onConfirm: (value: string) => {
            shared.nearcadeData.APIKey = value.trim() || null;
            return true;
        },
        onOpen: markDialogOpen,
        onClosed: markDialogClosed,
        closeOnEsc: true,
        closeOnOverlayClick: true,
        confirmText: "保存",
        cancelText: "取消",
    });
}
