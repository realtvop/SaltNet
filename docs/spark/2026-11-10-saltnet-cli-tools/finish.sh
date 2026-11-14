#!/bin/zsh
# usage: finish.sh <step-id> [--build]      e.g. finish.sh P1-17
# Ticks the step's checkbox in the plan, formats AGENTS.md and the plan with Prettier, then runs
# verify.sh (everything a commit must pass). Takes a few minutes: run it in the background and wait
# for its last line, `finish exit=<n>`:
#   ( nohup zsh finish.sh P1-17 > "$WORK/finish-P1-17.log" 2>&1; echo "finish exit=$?" >> "$WORK/finish-P1-17.log" ) > /dev/null 2>&1 &
set -u
HERE=${0:A:h}
source "$HERE/lib.sh"
cd "$REPO" || exit 2
python3 - "$1" "$PLAN" <<'PY'
import io, sys
step, path = sys.argv[1], sys.argv[2]
text = io.open(path, encoding="utf-8", newline="").read()
key = "- [ ] %s `" % step
if key in text:
    io.open(path, "w", encoding="utf-8", newline="").write(text.replace(key, "- [x] %s `" % step, 1))
    print("ticked", step)
else:
    print("NOT FOUND (already ticked?)", step)
PY
pnpm exec prettier --write AGENTS.md "$PLAN" > /dev/null
"$HERE/verify.sh" ${2:-} 2>&1 | grep -v '^   '
