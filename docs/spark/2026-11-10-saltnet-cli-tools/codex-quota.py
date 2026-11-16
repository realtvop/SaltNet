"""Prints how much of the Codex usage windows is used, via `codex app-server` (no model call)."""
import json, select, subprocess, sys, time, datetime

proc = subprocess.Popen(["codex", "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL, text=True)

def send(message):
    proc.stdin.write(json.dumps(message) + "\n")
    proc.stdin.flush()

def receive(wanted, timeout=45):
    end = time.time() + timeout
    while time.time() < end:
        ready, _, _ = select.select([proc.stdout], [], [], max(0.0, end - time.time()))
        if not ready:
            break
        line = proc.stdout.readline()
        if not line:
            break
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if message.get("id") == wanted:
            return message
    return None

def window(name, w):
    if not w:
        return f"{name}: none"
    resets = w.get("resetsAt")
    when = datetime.datetime.fromtimestamp(resets).strftime("%m-%d %H:%M") if resets else "?"
    mins = w.get("windowDurationMins")
    return f"{name}: {w.get('usedPercent')}% used of a {mins}-minute window, resets {when}"

try:
    send({"id": 1, "method": "initialize",
          "params": {"clientInfo": {"name": "quota_check", "version": "0.0.1"}}})
    if receive(1) is None:
        sys.exit("initialize got no answer")
    send({"method": "initialized"})
    send({"id": 2, "method": "account/rateLimits/read"})
    answer = receive(2)
    if answer is None:
        sys.exit("rateLimits/read got no answer")
    if "error" in answer:
        sys.exit("error: " + json.dumps(answer["error"])[:300])
    result = answer["result"]
    snapshots = []
    if result.get("rateLimits"):
        snapshots.append(("default", result["rateLimits"]))
    for key, snap in (result.get("rateLimitsByLimitId") or {}).items():
        snapshots.append((key, snap))
    print("ordinaryUsageAllowed:", result.get("ordinaryUsageAllowed"))
    for key, snap in snapshots:
        print(f"[{key}] {snap.get('limitName') or ''} reached={snap.get('rateLimitReachedType')}")
        print("  " + window("primary", snap.get("primary")))
        print("  " + window("secondary", snap.get("secondary")))
finally:
    proc.terminate()
