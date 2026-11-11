/**
 * Writing a file so that a reader never sees half of it: the content goes to a temporary file next
 * to the target, which is then renamed over it. Used for everything the CLI keeps as a plain file
 * (`config.json`, the raw snapshots in `cache/`).
 */
import { renameSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";

/**
 * Replaces `file` with `content` in one step. The file ends up with `mode` (private to the user by
 * default), whatever the old one had, because it is a new file that takes the old one's place.
 */
export function writeFileAtomic(file: string, content: string, mode = 0o600): void {
    const temporary = `${file}.${process.pid}.tmp`;
    try {
        // The mode only applies to a file that is created, which is what the temporary one is.
        writeFileSync(temporary, content, { mode });
        renameSync(temporary, file);
    } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
    }
}
