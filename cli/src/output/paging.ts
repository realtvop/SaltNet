/** Where a page of a list sits in the whole list; this is `meta.page` in the envelope. */
export interface PageInfo {
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
    /** Where the next page starts, or null when this was the last one. */
    readonly nextOffset: number | null;
}

export interface Page<T> {
    readonly items: T[];
    readonly page: PageInfo;
}

/** The slice a list command returns, together with the numbers an agent needs to ask for more. */
export function paginate<T>(
    all: readonly T[],
    window: { readonly limit: number; readonly offset: number }
): Page<T> {
    const { limit, offset } = window;
    const next = offset + limit;
    return {
        items: all.slice(offset, next),
        page: { total: all.length, offset, limit, nextOffset: next < all.length ? next : null },
    };
}
