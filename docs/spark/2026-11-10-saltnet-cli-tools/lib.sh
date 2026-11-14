# Shared by the scripts of this directory. Sourced, never run on its own.
# Needs: zsh, git, rsync, tar, node, python3.
#
# The calling script sets HERE to its own directory (`HERE=${0:A:h}`) before sourcing this file.

HERE=${HERE:?the calling script sets HERE to its own directory}
REPO=$(git -C "$HERE" rev-parse --show-toplevel) || exit 2
PLAN=$REPO/docs/spark/2026-11-10-saltnet-cli-plan.md
# Where snapshots, results and logs go. In a Claude Code session point this at the scratchpad.
WORK=${SALTNET_WORK:-${TMPDIR:-/tmp}/saltnet-cli-work}
mkdir -p "$WORK"
WORK=${WORK:A}   # absolute: the scripts change directory

# Files that must never reach another tool: the user's environment files.
_not_env() { grep -zvE '(^|/)\.env(\..*)?$'; }

# Turns the files in $1 into a git repository of its own (no remote) with one commit `base`, also
# tagged `base`, and links node_modules in from the real checkout so tsc and vitest can run.
_snapshot_init() {
    local dest=$1 dir
    (
        cd "$dest" || exit 2
        git init -q
        printf 'node_modules\n' >> .git/info/exclude
        git -c user.name=snapshot -c user.email=snapshot@example.invalid add -A
        git -c user.name=snapshot -c user.email=snapshot@example.invalid commit -q -m base
        git tag base
    ) || return 2
    for dir in . cli render-service; do
        if [ -d "$REPO/$dir/node_modules" ]; then ln -s "$REPO/$dir/node_modules" "$dest/$dir/node_modules"; fi
    done
    return 0
}

# Snapshot of the project as it is on disk right now: every file git knows (tracked, or untracked
# and not ignored), uncommitted work included, `.env*` left out. `base` is that state. Used to hand
# a task to a tool that writes code: whatever it changes shows up as the difference from `base`.
snapshot_worktree() {   # $1 = destination, wiped first
    local dest=$1
    rm -rf "$dest"; mkdir -p "$dest"
    (
        cd "$REPO" || exit 2
        git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do
            if [ -e "$f" ]; then printf '%s\0' "$f"; fi
        done | _not_env | rsync -a --from0 --files-from=- "$REPO/" "$dest/"
    ) || return 2
    _snapshot_init "$dest"
}

# Snapshot for a review: `base` is the last commit (HEAD, `.env*` left out) and the uncommitted work
# of the real tree is laid over it uncommitted, so `git diff base` is exactly the change under
# review (new files show in `git status`).
snapshot_candidate() {   # $1 = destination, wiped first
    local dest=$1 f
    rm -rf "$dest"; mkdir -p "$dest"
    ( cd "$REPO" && git archive HEAD | tar -x -C "$dest" ) || return 2
    find "$dest" \( -name '.env' -o -name '.env.*' \) -type f -delete
    _snapshot_init "$dest" || return 2
    (
        cd "$REPO" || exit 2
        { git diff HEAD --no-renames --name-only -z --diff-filter=ACMRT
          git ls-files -z --others --exclude-standard; } | _not_env | rsync -a --from0 --files-from=- "$REPO/" "$dest/"
        git diff HEAD --no-renames --name-only -z --diff-filter=D | while IFS= read -r -d '' f; do
            rm -f "$dest/$f"
        done
    )
    return 0
}

# What a tool changed in its snapshot: files.txt (`git status --short`) and patch.diff (binary-safe
# diff from `base`) in the directory $2.
collect_changes() {   # $1 = snapshot, $2 = output directory
    (
        cd "$1" || exit 2
        git -c user.name=snapshot -c user.email=snapshot@example.invalid add -A
        git status --short > "$2/files.txt"
        git diff --cached --binary base > "$2/patch.diff"
    )
}
