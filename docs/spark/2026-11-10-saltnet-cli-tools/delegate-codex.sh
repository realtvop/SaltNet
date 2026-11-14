#!/bin/zsh
# usage: delegate-codex.sh <name> <prompt-file>
#
# Hands one task to Codex (GPT 5.6 Sol, reasoning effort high) through `codex exec`. Same shape as
# delegate-agy.sh: a throwaway snapshot (lib.sh, snapshot_worktree: `.env*` left out, no remote,
# node_modules linked in), results in $WORK/delegate/<name>/ (prompt.md, response.txt, events.jsonl,
# stderr.log, patch.diff, files.txt, run.log), nothing applied to the real repository.
#
# Set CODEX_MODEL_WRITE to the model id Codex uses for GPT 5.6 Sol (there is no default on purpose:
# the user's own default in ~/.codex/config.toml is another model). CODEX_EFFORT overrides `high`.
#
# The sandbox is `workspace-write` (writes only inside the snapshot, no network) and approvals are
# turned off, so a command that needs more than that fails instead of waiting for an answer.
set -u
HERE=${0:A:h}
source "$HERE/lib.sh"

name=${1:?task name}
prompt_file=${2:?prompt file}
MODEL=${CODEX_MODEL_WRITE:?set CODEX_MODEL_WRITE to the Codex model id of GPT 5.6 Sol}
EFFORT=${CODEX_EFFORT:-high}
CODEX=${CODEX:-$(command -v codex || print -r -- "$HOME/.local/bin/codex")}

out=$WORK/delegate/$name
rm -rf "$out"; mkdir -p "$out"
cp "$prompt_file" "$out/prompt.md"
snapshot_worktree "$out/work" || exit 2

start=$(date +%s)
"$CODEX" exec -C "$out/work" -m "$MODEL" -s workspace-write --ephemeral --color never --json \
    -c "model_reasoning_effort=\"$EFFORT\"" -c 'approval_policy="never"' \
    -o "$out/response.txt" - < "$out/prompt.md" > "$out/events.jsonl" 2> "$out/stderr.log"
code=$?
end=$(date +%s)

collect_changes "$out/work" "$out"
echo "codex exit $code, $((end - start)) s, patch $(wc -c < "$out/patch.diff" | tr -d ' ') bytes" > "$out/run.log"
cat "$out/run.log"
