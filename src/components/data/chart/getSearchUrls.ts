import { ChartType } from "../maiTypes";
import type { Chart } from "../music/type";

export function getChartSearchUrls(chart: Chart): typeof VideoSearchUrls {
    const urls: typeof VideoSearchUrls = [];
    for (const template of VideoSearchUrls) {
        urls.push({
            name: template.name,
            url: template.url.replace(
                "%s",
                encodeURIComponent(
                    `${chart.music.info.title} ${chart.music.info.type == ChartType.Deluxe ? "DX" : template.name === "YT" ? "スタンダード" : "标"} ${["BASIC", "ADVANDCED", "EXPERT", "MASTER", "Re:MASTER"][chart.info.grade]} ${chart.info.level}`
                )
            ),
            icon: template.icon,
        });
    }
    return urls;
}
const VideoSearchUrls = [
    // prettier-ignore
    { name: "YT", url: `https://www.youtube.com/results?search_query=%s`, icon: "smart_display" },
    { name: "B站客户端", url: `bilibili://search?keyword=%s`, icon: "tv" },
    { name: "B站网页版", url: `https://search.bilibili.com/all?keyword=%s`, icon: "tv" },
];
