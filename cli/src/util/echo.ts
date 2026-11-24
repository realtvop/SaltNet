/** Short, plain words only: a longer or odder value could be a pasted secret, so it is not echoed. */
const ECHOABLE = /^[\p{L}\p{N}_.:+-]{1,40}$/u;

/** The value in 「」 for an error message, or nothing when it should not be repeated. */
export function echo(raw: string): string {
    return ECHOABLE.test(raw) ? `「${raw}」` : "";
}
