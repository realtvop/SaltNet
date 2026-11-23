/**
 * Writing a file so that a reader never sees half of it: the content goes to a temporary file next
 * to the target, which is then renamed over it. Used for everything the CLI keeps as a plain file
 * (`config.json`, the raw snapshots in `cache/`).
 */
import { randomUUID } from "node:crypto";
import { closeSync, fchmodSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";

export interface StagedFile {
    /** Atomically puts the staged content at its final path. */
    commit: () => void;
    /** Removes the temporary file without changing the final path. */
    discard: () => void;
}

/**
 * Writes a complete temporary file next to `file`, but leaves the final rename to the caller. This
 * is used when another transaction has to commit before the file becomes visible.
 */
export function stageFileAtomic(
    file: string,
    content: string | Uint8Array,
    mode = 0o600
): StagedFile {
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    let descriptor: number | undefined;
    try {
        descriptor = openSync(temporary, "wx", mode);
        writeFileSync(descriptor, content);
        fchmodSync(descriptor, mode);
        closeSync(descriptor);
        descriptor = undefined;
    } catch (error) {
        if (descriptor !== undefined) closeSync(descriptor);
        rmSync(temporary, { force: true });
        throw error;
    }

    let finished = false;
    return {
        commit: () => {
            if (finished) throw new Error("staged file is already finished");
            try {
                renameSync(temporary, file);
                finished = true;
            } catch (error) {
                rmSync(temporary, { force: true });
                finished = true;
                throw error;
            }
        },
        discard: () => {
            if (finished) return;
            rmSync(temporary, { force: true });
            finished = true;
        },
    };
}

/**
 * Replaces `file` with `content` in one step. The file ends up with `mode` (private to the user by
 * default), whatever the old one had, because it is a new file that takes the old one's place.
 */
export function writeFileAtomic(file: string, content: string | Uint8Array, mode = 0o600): void {
    const staged = stageFileAtomic(file, content, mode);
    try {
        staged.commit();
    } catch (error) {
        staged.discard();
        throw error;
    }
}
