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
 * The names closest to what was typed, nearest first: those within a couple of edits, or that
 * start with it (`--grp` and `--group-by`). Ties keep the order of `candidates`.
 */
export function closestMatches(input: string, candidates: readonly string[], limit = 3): string[] {
    const wanted = input.toLowerCase();
    const threshold = Math.max(2, Math.floor(wanted.length / 3));
    return candidates
        .map((candidate, index) => {
            const name = candidate.toLowerCase();
            const prefix = wanted.length >= 2 && name.startsWith(wanted);
            return { candidate, index, distance: prefix ? 0 : editDistance(wanted, name) };
        })
        .filter(entry => entry.distance <= threshold)
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .slice(0, limit)
        .map(entry => entry.candidate);
}
