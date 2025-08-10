export function getCoverURL(id: number): string {
    if (10000 < id) id -= Math.floor(id / 10000) * 10000;
    return `https://jacket.maimai.realtvop.top/${"0".repeat(Math.max(5 - id.toString().length, 0))}${id}.png`;
}
