import { ScoreCoefficient } from "./ScoreCoefficient";
import { get_min_ach } from "./utils";
import { getRankRateByAchievement, type RankRate } from "@/types/maiTypes";

export function getDetailedRatingsByDs(
    ds: number,
    achievements?: number
): Array<{ ds: number; achievements: number; rating: number; rank: RankRate }> {
    let min_idx = 5;
    let min_ach4 = Math.round(get_min_ach(min_idx) * 10000);
    let max_idx = 13;
    let max_ach4 = Math.round(get_min_ach(max_idx + 1) * 10000);
    let more_ra: Array<{ ds: number; achievements: number; rating: number; rank: RankRate }> = [];
    for (let curr_ach4 = min_ach4; curr_ach4 < max_ach4; curr_ach4 += 2500) {
        let curr_min_ra = new ScoreCoefficient(curr_ach4 / 10000).ra(ds);
        if (curr_min_ra > new ScoreCoefficient((curr_ach4 - 1) / 10000).ra(ds)) {
            more_ra.push({
                ds: ds,
                achievements: curr_ach4 / 10000,
                rating: curr_min_ra,
                rank: getRankRateByAchievement(curr_ach4 / 10000),
            });
        }
        let curr_max_ra = new ScoreCoefficient((curr_ach4 + 2499) / 10000).ra(ds);
        if (curr_max_ra > curr_min_ra) {
            let l = curr_ach4,
                r = curr_ach4 + 2499,
                ans = r;
            while (r >= l) {
                let mid = Math.floor((r + l) / 2);
                if (new ScoreCoefficient(mid / 10000).ra(ds) > curr_min_ra) {
                    ans = mid;
                    r = mid - 1;
                } else {
                    l = mid + 1;
                }
            }
            more_ra.push({
                ds: ds,
                achievements: ans / 10000,
                rating: curr_max_ra,
                rank: getRankRateByAchievement(ans / 10000),
            });
        }
    }
    more_ra.sort((a, b) => b.achievements - a.achievements);
    more_ra = more_ra.filter((item, index) => item.achievements % 0.5 === 0 || more_ra[index + 1].achievements % 0.5 === 0);

    // 如果提供了achievements参数，过滤出achievements高于输入值的数据，并向下多取一个项目
    if (achievements !== undefined) {
        const filteredItems: Array<{
            ds: number;
            achievements: number;
            rating: number;
            rank: RankRate;
        }> = [];
        let foundFirstLower = false;

        for (let i = 0; i < more_ra.length; i++) {
            if (more_ra[i].achievements > achievements) {
                filteredItems.push(more_ra[i]);
            } else if (!foundFirstLower) {
                // 找到第一个不满足条件的项目，也加入结果
                filteredItems.push(more_ra[i]);
                foundFirstLower = true;
            }
        }

        more_ra = filteredItems;
    }

    return more_ra;
}
