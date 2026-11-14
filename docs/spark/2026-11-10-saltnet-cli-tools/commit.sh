#!/bin/zsh
# usage: commit.sh "<subject>" "<body>" ["<validation>" ["<ai-assistance>"]]
# One commit of everything in the working tree except the user's own `.env*` files and `.wrangler`.
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
git add -A
# Never sweep the user's own in-flight environment files or wrangler state into a step's commit.
git reset -q -- .env '.env.*' .wrangler 2>/dev/null
git commit -q -F - <<MSG
$1

$2

Validation: $VAL

AI assistance: $AI
MSG
git log --oneline | head -1
git status --short | head -3
