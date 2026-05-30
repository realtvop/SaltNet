import { isRatingCoefficientBoundary, ScoreCoefficient } from "./ScoreCoefficient";
import { get_min_ach } from "./utils";
import { getRankRateByAchievement, type RankRate } from "@/components/data/maiTypes";

interface DetailedRating {
    ds: number;
    achievements: number;
    rating: number;
    rank: RankRate;
}

interface DetailedRatingWithAchievement4 extends DetailedRating {
    achievement4: number;
}

const ACHIEVEMENT_SCALE = 10_000;
const HALF_PERCENT_ACHIEVEMENT4 = 5_000;
const RATING_STAGE_STEP_ACHIEVEMENT4 = 2_500;

export function getDetailedRatingsByConstant(ds: number, achievements?: number): DetailedRating[] {
    const min_idx = 5;
    const min_ach4 = Math.round(get_min_ach(min_idx) * ACHIEVEMENT_SCALE);
    const max_idx = 13;
    const max_ach4 = Math.round(get_min_ach(max_idx + 1) * ACHIEVEMENT_SCALE);
    let more_ra: DetailedRatingWithAchievement4[] = [];
    const getRating = (achievement4: number) =>
        new ScoreCoefficient(achievement4 / ACHIEVEMENT_SCALE).ra(ds);

    for (
        let curr_ach4 = min_ach4;
        curr_ach4 < max_ach4;
        curr_ach4 += RATING_STAGE_STEP_ACHIEVEMENT4
    ) {
        const curr_max_ach4 = Math.min(
            curr_ach4 + RATING_STAGE_STEP_ACHIEVEMENT4 - 1,
            max_ach4 - 1
        );
        let next_ach4 = curr_ach4;
        let previous_ra = getRating(curr_ach4 - 1);

        while (next_ach4 <= curr_max_ach4 && getRating(curr_max_ach4) > previous_ra) {
            let l = next_ach4,
                r = curr_max_ach4,
                ans = r;
            while (r >= l) {
                let mid = Math.floor((r + l) / 2);
                if (getRating(mid) > previous_ra) {
                    ans = mid;
                    r = mid - 1;
                } else {
                    l = mid + 1;
                }
            }
            more_ra.push({
                ds: ds,
                achievements: ans / ACHIEVEMENT_SCALE,
                achievement4: ans,
                rating: getRating(ans),
                rank: getRankRateByAchievement(ans / ACHIEVEMENT_SCALE),
            });
            previous_ra = getRating(ans);
            next_ach4 = ans + 1;
        }
    }
    more_ra.sort((a, b) => b.achievements - a.achievements);
    more_ra = more_ra.filter((item, index) => {
        const nextItem = more_ra[index + 1];
        return (
            item.achievement4 % HALF_PERCENT_ACHIEVEMENT4 === 0 ||
            (nextItem?.achievement4 ?? -1) % HALF_PERCENT_ACHIEVEMENT4 === 0 ||
            isRatingCoefficientBoundary(item.achievement4)
        );
    });

    // 如果提供了achievements参数，过滤出achievements高于输入值的数据，并向下多取一个项目
    if (achievements !== undefined) {
        const filteredItems: DetailedRatingWithAchievement4[] = [];
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

    return more_ra.map(item => ({
        ds: item.ds,
        achievements: item.achievements,
        rating: item.rating,
        rank: item.rank,
    }));
}
