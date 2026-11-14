#!/bin/zsh
# usage: delegate-agy.sh <name> <prompt-file> [mode]      mode: accept-edits (default) | plan
#
# Hands one task to Gemini 3.8 Flash (Medium) through the Antigravity CLI (`agy`).
#
# The model never sees the real working tree. It gets a throwaway snapshot (see lib.sh,
# snapshot_worktree: `.env*` left out, no remote, node_modules linked in from the real checkout).
# `~/.saltnet`, the real `.git` and ignored files are not in it.
#
# Results land in $WORK/delegate/<name>/: prompt.md, response.txt (what the model said),
# patch.diff (everything it changed, binary-safe), files.txt (`git status --short`), run.log
# (timing and exit code). Nothing is applied to the real repository: review patch.diff, then
# `git apply` it yourself.
#
# Headless runs cannot ask for permission, so a command that is not allowed is denied, and the first
# refused command aborts the whole run and throws the work away: the brief must tell the model which
# commands it has (see brief-template.md). `auto` mode is not available; `--dangerously-skip-permissions`
# is deliberately never used.
set -u
HERE=${0:A:h}
source "$HERE/lib.sh"

name=${1:?task name}
prompt_file=${2:?prompt file}
mode=${3:-accept-edits}
AGY=${AGY:-$(command -v agy || print -r -- "$HOME/.local/bin/agy")}
MODEL=${AGY_MODEL:-gemini-3.8-flash-medium}

out=$WORK/delegate/$name
rm -rf "$out"; mkdir -p "$out"
cp "$prompt_file" "$out/prompt.md"
snapshot_worktree "$out/work" || exit 2

# The inline --settings replaces the user's own allow-list for this run only and is never saved.
# Rules are `command(<binary> <subcommand>)`, matched on whole words.
ALLOW='"command(pnpm vitest)","command(pnpm prettier)","command(pnpm eslint)","command(pnpm tsc)","command(pnpm vue-tsc)","command(pnpm check)","command(pnpm lint)","command(pnpm test:cli)","command(pnpm test)","command(pnpm --filter saltnet-cli vitest)","command(pnpm --filter saltnet-cli test)","command(pnpm --filter saltnet-cli tsc)","command(pnpm --filter saltnet-cli exec vitest)","command(pnpm --filter saltnet-cli exec tsc)","command(pnpm exec vitest)","command(pnpm exec tsc)","command(pnpm exec eslint)","command(pnpm exec prettier)","command(git status)","command(git diff)","command(git mv)","command(git rm)"'
SETTINGS="{\"permissions\":{\"allow\":[$ALLOW]}}"

start=$(date +%s)
( cd "$out/work" && "$AGY" --model "$MODEL" --mode "$mode" --settings "$SETTINGS" --print-timeout 40m \
    --print "$(cat "$out/prompt.md")" ) > "$out/response.txt" 2>&1
code=$?
end=$(date +%s)

collect_changes "$out/work" "$out"
echo "agy exit $code, $((end - start)) s, patch $(wc -c < "$out/patch.diff" | tr -d ' ') bytes" > "$out/run.log"
cat "$out/run.log"
