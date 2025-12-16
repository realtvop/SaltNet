export function toHalfWidth(str: string): string {
    return str
        .replace(/[\uFF01-\uFF5E]/g, char => {
            return String.fromCharCode(char.charCodeAt(0) - 65248);
        })
        .replace(/\u3000/g, " ");
}