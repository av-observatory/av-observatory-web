#!/usr/bin/env bash
# FL extract helper: commit and push data-state/states/FL, tolerating rebase trouble (other agents push often).
#   fl-push-progress.sh once "<message>"      commit+push once (retries)
#   fl-push-progress.sh run <command...>      run a command, pushing progress every 150s, and once more at the end
cd "$(git rev-parse --show-toplevel)" || exit 1
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

push_once() {
  git add data-state/states/FL
  if git diff --cached --quiet; then return 0; fi
  git commit -q -m "$1"
  for i in 1 2 3 4 5; do
    if git pull -q --rebase -X theirs origin "$GITHUB_REF_NAME"; then
      git push -q origin "HEAD:$GITHUB_REF_NAME" && { echo "pushed: $1"; return 0; }
    else
      git rebase --abort 2>/dev/null
    fi
    sleep $((i * 5))
  done
  echo "push failed: $1" >&2
  return 1
}

case "$1" in
  once) push_once "$2" ;;
  run)
    shift
    ( while sleep 150; do push_once "FL progress $(date -u +%H:%M)" || true; done ) &
    BG=$!
    "$@"
    code=$?
    kill "$BG" 2>/dev/null
    wait "$BG" 2>/dev/null
    push_once "FL part done $(date -u +%H:%M)" || true
    exit $code
    ;;
esac
