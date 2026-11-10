/**
 * A name as it is compared when case and width do not matter: `ＴＲＵＳＴ`, `TRUST` and `trust`
 * all fold to `trust`. Only for equality; whatever is shown to the user keeps its original form.
 */
export function foldName(text: string): string {
    return text.normalize("NFKC").toLowerCase();
}
