#!/bin/zsh
# usage: verify.sh [--build]
# Runs everything a commit must pass: pnpm check, pnpm lint, every test:* script of the root package,
# the render-service test and check (and pnpm build with --build, needed when web code or
# shared/core was touched). Checks the WHOLE working tree. Prints one line per check and the tail
# of the failing ones; exits 1 if anything failed. Logs: $WORK/v/<check>.log
set -u
HERE=${0:A:h}
source "$HERE/lib.sh"
cd "$REPO" || exit 2
V=$WORK/v
mkdir -p "$V" && rm -f "$V"/*(N)
run() { local name=$1; shift; ( "$@" > "$V/$name.log" 2>&1; echo $? > "$V/$name.exit" ) & }
run check pnpm check
run lint pnpm lint
for t in $(node -e 'console.log(Object.keys(require("./package.json").scripts).filter(k=>k.startsWith("test:")).join(" "))'); do
    run ${t//:/_} pnpm run $t
done
run render_test pnpm --filter saltnet-render-service test
run render_check pnpm --filter saltnet-render-service check
wait
if [[ "${1:-}" == "--build" ]]; then
    run build pnpm build
    wait
fi
fail=0
for f in "$V"/*.exit; do
    n=${f:t:r}
    c=$(<"$f")
    if [[ $c != 0 ]]; then
        echo "FAIL $n (exit $c)"
        tail -30 "$V/$n.log"
        fail=1
    else
        echo "ok   $n"
    fi
done
# surface vitest pass counts compactly
grep -h -E 'Tests +[0-9]+ passed|^# pass' "$V"/*.log 2>/dev/null | sed 's/^/     /' | sort | uniq -c | head -20
exit $fail
