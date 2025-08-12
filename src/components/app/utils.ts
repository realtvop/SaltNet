import { snackbar } from "mdui";

export function copyTextToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    snackbar({ message: `已复制：${text}`, autoCloseDelay: 1000 });
}
