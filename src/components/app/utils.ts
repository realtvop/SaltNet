// Sober snackbar utility
export function showSnackbar(options: { message: string; type?: string; duration?: number }) {
    const snackbar = document.createElement("s-snackbar");
    snackbar.textContent = options.message;
    if (options.type) {
        snackbar.setAttribute("type", options.type);
    }
    if (options.duration) {
        snackbar.duration = options.duration;
    }
    document.body.appendChild(snackbar);
    (snackbar as any).show();

    // Auto-remove after duration
    setTimeout(() => {
        if (snackbar.parentNode) {
            document.body.removeChild(snackbar);
        }
    }, options.duration || 3000);
}

export function copyTextToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    showSnackbar({ message: `已复制：${text}`, duration: 1000 });
}
