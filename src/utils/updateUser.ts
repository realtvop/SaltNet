import { fetchPlayerData } from "@/divingfish";
import type { DivingFishResponse } from "@/divingfish/type";
import type { User } from "@/types/user";

export function updateUser(user: User) {
    if (!user.data) user.data = {};

    if (user.inGame.id) {
        
    } else {
        if (user.divingFish.name) {
            fetchPlayerData(user.divingFish.name)
                .then((data: DivingFishResponse) => {
                    console.log(data)

                    user.data.rating = data.rating;
                    user.data.b50 = data.charts;
                });
        }
    }
}