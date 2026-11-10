/**
 * Edit distance that counts swapping two neighbouring letters as one edit, the commonest typo
 * after a wrong or missing letter.
 */
export function editDistance(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const table: number[][] = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => 0)
    );
    for (let i = 0; i < rows; i++) table[i][0] = i;
    for (let j = 0; j < cols; j++) table[0][j] = j;
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            table[i][j] = Math.min(
                table[i - 1][j] + 1,
                table[i][j - 1] + 1,
                table[i - 1][j - 1] + cost
            );
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
            }
        }
    }
    return table[a.length][b.length];
}

/**
 * The items whose names are closest to what was typed, nearest first: those within a couple of
 * edits, or that start with it (`--grp` and `--group-by`). An item may have several names (a
 * title and its aliases) and counts by the nearest. Ties keep the order of `items`.
 */
export function closestItems<T>(
    input: string,
    items: readonly T[],
    namesOf: (item: T) => readonly string[],
    limit = 3
): T[] {
    const wanted = input.toLowerCase();
    const threshold = Math.max(2, Math.floor(wanted.length / 3));
    const ranked: { item: T; index: number; distance: number }[] = [];
    items.forEach((item, index) => {
        let distance = Number.POSITIVE_INFINITY;
        for (const raw of namesOf(item)) {
            const name = raw.toLowerCase();
            if (wanted.length >= 2 && name.startsWith(wanted)) {
                distance = 0;
                break;
            }
            // Turning one string into the other takes at least as many edits as they differ in
            // length, so a long title is not worth the full comparison.
            if (Math.abs(name.length - wanted.length) > threshold) continue;
            distance = Math.min(distance, editDistance(wanted, name));
        }
        if (distance <= threshold) ranked.push({ item, index, distance });
    });
    return ranked
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .slice(0, limit)
        .map(entry => entry.item);
}

/** The names closest to what was typed, nearest first; see `closestItems`. */
export function closestMatches(input: string, candidates: readonly string[], limit = 3): string[] {
    return closestItems(input, candidates, candidate => [candidate], limit);
}
