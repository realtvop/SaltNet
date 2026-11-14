#!/bin/zsh
# usage: review-codex.sh <name> <prompt-file>
#
# Asks Codex (GPT 6.1 Sol, reasoning effort high) to review what is uncommitted in the real tree.
# The reviewer works in a snapshot whose `base` is the last commit with the uncommitted work laid
# over it (lib.sh, snapshot_candidate; `.env*` left out), so `git diff base` is exactly the change.
# The sandbox is read-only. The prompt file says what the change is meant to do (the step, the
# design sections, what to look at hardest); the standard instructions below are appended to it.
#
# Result: $WORK/review/<name>/review.txt (the findings), plus prompt.md, events.jsonl, stderr.log,
# run.log. Findings are leads, not verdicts: check each one before acting on it.
#
# Set CODEX_MODEL_REVIEW to the Codex model id of GPT 6.1 Sol (no default on purpose).
# REVIEW_BUILTIN=1 also runs Codex's own `codex review --uncommitted` in parallel, as a second
# opinion without the brief (the command accepts no custom instructions together with
# --uncommitted); its answer goes to review-builtin.txt.
set -u
HERE=${0:A:h}
source "$HERE/lib.sh"

name=${1:?review name}
prompt_file=${2:?prompt file}
MODEL=${CODEX_MODEL_REVIEW:?set CODEX_MODEL_REVIEW to the Codex model id of GPT 6.1 Sol}
EFFORT=${CODEX_EFFORT:-high}
CODEX=${CODEX:-$(command -v codex || print -r -- "$HOME/.local/bin/codex")}

out=$WORK/review/$name
rm -rf "$out"; mkdir -p "$out"
{
    cat "$prompt_file"
    cat <<'FOOTER'

## How to review

The change under review is the difference between the `base` tag and the working tree of this
repository: `git diff base`, plus the untracked files in `git status --short`. Read the whole change
and the code around it, not only the diff. Do not edit any file and do not run anything that writes
outside this directory.

Report, most serious first, only problems you can point to. For each one give file:line, what is
wrong, a concrete input or state that triggers it, and how sure you are (certain, likely, unsure).
Group them as:

1. Bugs, and behavior that differs from the brief above or from the design document
   (`docs/spark/2026-11-10-saltnet-cli-design.md`).
2. Security and privacy: credentials or tokens reaching output, logs or files with the wrong
   permissions, network calls the brief did not ask for, anything that could modify a real account.
3. Tests that would still pass if the code were wrong (name the missing case).
4. Rules of the repository that the change breaks (`AGENTS.md`, the general rules of
   `docs/spark/2026-11-10-saltnet-cli-plan.md`).

Do not list style preferences that Prettier or ESLint already settle, and do not praise. If a group
has nothing, write "none".
FOOTER
} > "$out/prompt.md"
snapshot_candidate "$out/work" || exit 2

start=$(date +%s)
if [ "${REVIEW_BUILTIN:-0}" = 1 ]; then
    ( cd "$out/work" && "$CODEX" review --uncommitted -c "model=\"$MODEL\"" \
        -c "model_reasoning_effort=\"$EFFORT\"" -c 'approval_policy="never"' -c 'sandbox_mode="read-only"' \
        > "$out/review-builtin.txt" 2> "$out/review-builtin.err" ) &
fi
"$CODEX" exec -C "$out/work" -m "$MODEL" -s read-only --ephemeral --color never --json \
    -c "model_reasoning_effort=\"$EFFORT\"" -c 'approval_policy="never"' \
    -o "$out/review.txt" - < "$out/prompt.md" > "$out/events.jsonl" 2> "$out/stderr.log"
code=$?
wait
end=$(date +%s)
echo "codex exit $code, $((end - start)) s, review $(wc -c < "$out/review.txt" 2>/dev/null | tr -d ' ') bytes" > "$out/run.log"
cat "$out/run.log"
