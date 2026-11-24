#!/bin/zsh
# usage: commit.sh "<subject>" "<body>" ["<validation>" ["<ai-assistance>"]]
# One commit of everything in the working tree except the user's own `.env*` files (at any depth)
# and `.wrangler`.
# The message is: subject, body, `Validation: …`, `AI assistance: …` (say who did what: which tool
# wrote what, what was reviewed, what was fixed by hand). Pass arguments in single quotes and avoid
# apostrophes inside them. To fix a message afterwards: git log -1 --format=%B > msg.txt, edit it,
# git commit --amend -q -F msg.txt
set -u
HERE=${0:A:h}
source "$HERE/lib.sh"
cd "$REPO" || exit 2
VAL=${3:-"pnpm check, pnpm lint, every test:* script, render-service test and check passed."}
AI=${4:-"Claude (coordinator)."}
# Never stage the user's own environment files (at any depth) or wrangler state, and stop when git
# fails, so a caller never mistakes an unchanged or half-staged tree for a finished commit.
ENV_FILES='(^|/)\.env(\..*)?$|(^|/)\.wrangler(/|$)'
git add -A -- . ':(exclude,glob)**/.env' ':(exclude,glob)**/.env.*' ':(exclude,glob)**/.wrangler/**' || exit 1
if git diff --cached --name-only | grep -qE "$ENV_FILES"; then
    echo "refusing to commit: an environment or wrangler file is staged" >&2
    git diff --cached --name-only | grep -E "$ENV_FILES" >&2
    exit 1
fi
git commit -q -F - <<MSG
$1

$2

Validation: $VAL

AI assistance: $AI
MSG
[ $? -eq 0 ] || exit 1
git log --oneline -1
git status --short | head -3
