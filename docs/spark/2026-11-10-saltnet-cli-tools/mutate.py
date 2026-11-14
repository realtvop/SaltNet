#!/usr/bin/env python3
"""usage: mutate.py <mutations.json> <test file>...

Each mutation is {"name", "file", "old", "new"}; `file` is relative to the repository root and
`old` must occur exactly once. For every mutation the file is changed, the given vitest files are
run in cli/, and the file is put back (also on error). A mutation is "killed" when the tests fail.
Prints one line per mutation and a summary; exits 1 when a mutation survived.
"""
import hashlib
import io
import json
import os
import subprocess
import sys

# docs/spark/2026-11-10-saltnet-cli-tools/mutate.py -> the repository root
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


def read(path):
    with io.open(path, encoding="utf-8", newline="") as handle:
        return handle.read()


def write(path, text):
    with io.open(path, "w", encoding="utf-8", newline="") as handle:
        handle.write(text)


def digest(path):
    return hashlib.sha256(read(path).encode("utf-8")).hexdigest()[:12]


def main():
    mutations = json.load(io.open(sys.argv[1], encoding="utf-8"))
    tests = sys.argv[2:]
    survived = []
    before = {m["file"]: digest(ROOT + "/" + m["file"]) for m in mutations}
    for mutation in mutations:
        path = ROOT + "/" + mutation["file"]
        original = read(path)
        count = original.count(mutation["old"])
        if count != 1:
            print("SKIP   %-44s old text occurs %d times" % (mutation["name"], count))
            survived.append(mutation["name"] + " (not applied)")
            continue
        try:
            write(path, original.replace(mutation["old"], mutation["new"]))
            result = subprocess.run(
                ["pnpm", "exec", "vitest", "run"] + tests,
                cwd=ROOT + "/cli",
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
            )
        finally:
            write(path, original)
        failed = [line.strip() for line in result.stdout.splitlines() if " FAIL " in line or line.strip().startswith("×")]
        if result.returncode != 0:
            print("KILLED %-44s %d failing test line(s); first: %s" % (mutation["name"], len(failed), failed[0] if failed else "?"))
        else:
            print("ALIVE  %-44s" % mutation["name"])
            survived.append(mutation["name"])
    after = {m["file"]: digest(ROOT + "/" + m["file"]) for m in mutations}
    print("files restored: %s" % (before == after))
    print("survivors: %s" % (survived or "none"))
    return 1 if survived or before != after else 0


sys.exit(main())
