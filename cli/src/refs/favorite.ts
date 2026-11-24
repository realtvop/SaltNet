import type { NamedKind } from "./named";
import { resolveNamed } from "./named";

export interface FavoriteLike {
    readonly name: string;
}

export const FAVORITE_NAMED_KIND: NamedKind<FavoriteLike> = {
    noun: "收藏夹",
    names: fav => [fav.name],
    partialNames: fav => [fav.name],
    candidate: fav => ({ ref: fav.name, title: fav.name }),
};

export function resolveFavorite<T extends FavoriteLike>(favorites: readonly T[], text: string): T {
    return resolveNamed(favorites, text, FAVORITE_NAMED_KIND as unknown as NamedKind<T>);
}
