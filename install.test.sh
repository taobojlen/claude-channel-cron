#!/usr/bin/env bash
# Tests for install.sh — uses a temp file instead of real crontab
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL="$SCRIPT_DIR/install.sh"
TMPFILE="$(mktemp)"
export CRONTAB_FILE="$TMPFILE"

pass=0
fail=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: $desc"
    pass=$((pass + 1))
  else
    echo "FAIL: $desc"
    echo "  expected: $expected"
    echo "  actual:   $actual"
    fail=$((fail + 1))
  fi
}

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "PASS: $desc"
    pass=$((pass + 1))
  else
    echo "FAIL: $desc"
    echo "  expected to contain: $needle"
    echo "  actual: $haystack"
    fail=$((fail + 1))
  fi
}

assert_not_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if ! echo "$haystack" | grep -qF "$needle"; then
    echo "PASS: $desc"
    pass=$((pass + 1))
  else
    echo "FAIL: $desc"
    echo "  expected NOT to contain: $needle"
    echo "  actual: $haystack"
    fail=$((fail + 1))
  fi
}

reset() {
  > "$TMPFILE"
}

# --- Test: add creates a crontab entry ---
reset
"$INSTALL" add "daily-analysis" "0 9 * * *" "Analyze the data"
content="$(cat "$TMPFILE")"
assert_contains "add creates crontab entry" "# cron-channel: daily-analysis" "$content"
assert_contains "add includes cron schedule" "0 9 * * *" "$content"
assert_contains "add includes curl command" 'curl' "$content"
assert_contains "add includes prompt in body" "Analyze the data" "$content"
assert_contains "add includes X-Task-Id header" "X-Task-Id: daily-analysis" "$content"

# --- Test: list shows managed entries ---
reset
"$INSTALL" add "task-a" "0 9 * * *" "Do A"
"$INSTALL" add "task-b" "30 14 * * *" "Do B"
output="$("$INSTALL" list)"
assert_contains "list shows task-a" "task-a" "$output"
assert_contains "list shows task-b" "task-b" "$output"

# --- Test: remove deletes entry ---
reset
"$INSTALL" add "to-remove" "0 9 * * *" "Remove me"
"$INSTALL" remove "to-remove"
content="$(cat "$TMPFILE")"
assert_not_contains "remove deletes entry" "to-remove" "$content"

# --- Test: add duplicate replaces existing ---
reset
"$INSTALL" add "dup-task" "0 9 * * *" "First version"
"$INSTALL" add "dup-task" "30 10 * * *" "Second version"
content="$(cat "$TMPFILE")"
count="$(echo "$content" | grep -c "# cron-channel: dup-task" || true)"
assert_eq "duplicate add replaces (count=1)" "1" "$count"
assert_contains "duplicate add has new schedule" "30 10 * * *" "$content"
assert_contains "duplicate add has new prompt" "Second version" "$content"

# --- Test: remove preserves other entries ---
reset
"$INSTALL" add "keep-me" "0 8 * * *" "Keep"
"$INSTALL" add "remove-me" "0 9 * * *" "Remove"
"$INSTALL" remove "remove-me"
content="$(cat "$TMPFILE")"
assert_contains "remove preserves other entries" "keep-me" "$content"
assert_not_contains "remove only removes target" "remove-me" "$content"

# --- Summary ---
echo ""
echo "Results: $pass passed, $fail failed"
rm -f "$TMPFILE"
[ "$fail" -eq 0 ]
