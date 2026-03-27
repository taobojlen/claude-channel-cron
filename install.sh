#!/usr/bin/env bash
set -euo pipefail

PORT="${CRON_CHANNEL_PORT:-8790}"
TAG="# cron-channel:"

# If CRONTAB_FILE is set, use it directly (for testing). Otherwise use crontab.
read_crontab() {
  if [ -n "${CRONTAB_FILE:-}" ]; then
    cat "$CRONTAB_FILE" 2>/dev/null || true
  else
    crontab -l 2>/dev/null || true
  fi
}

write_crontab() {
  if [ -n "${CRONTAB_FILE:-}" ]; then
    cat > "$CRONTAB_FILE"
  else
    crontab -
  fi
}

cmd_add() {
  local task_id="$1" cron_expr="$2" prompt="$3"
  # Remove existing entry with same task_id first
  local existing
  existing="$(read_crontab | grep -v "$TAG $task_id\$" || true)"
  {
    [ -n "$existing" ] && echo "$existing"
    echo "$cron_expr curl -s -X POST -H \"X-Task-Id: $task_id\" -d \"$prompt\" http://127.0.0.1:$PORT/ $TAG $task_id"
  } | write_crontab
}

cmd_remove() {
  local task_id="$1"
  local remaining
  remaining="$(read_crontab | grep -v "$TAG $task_id\$" || true)"
  echo "$remaining" | write_crontab
}

cmd_list() {
  read_crontab | grep "$TAG" | while IFS= read -r line; do
    local task_id="${line##*$TAG }"
    local cron_expr="${line%% curl*}"
    echo "$task_id  $cron_expr"
  done
}

case "${1:-}" in
  add)
    [ $# -lt 4 ] && { echo "Usage: $0 add <task-id> <cron-expr> <prompt>"; exit 1; }
    cmd_add "$2" "$3" "$4"
    ;;
  remove)
    [ $# -lt 2 ] && { echo "Usage: $0 remove <task-id>"; exit 1; }
    cmd_remove "$2"
    ;;
  list)
    cmd_list
    ;;
  *)
    echo "Usage: $0 {add|remove|list}"
    exit 1
    ;;
esac
