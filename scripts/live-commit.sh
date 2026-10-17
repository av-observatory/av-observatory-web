#!/usr/bin/env bash
# Run a command while committing ledger progress every 90s, so progress is visible in the repo during the run.
(
  while sleep 90; do
    bash scripts/commit-ledgers.sh "Live progress $(date -u +%H:%M)" || true
  done
) &
LIVE=$!
set +e
"$@"
code=$?
kill "$LIVE" 2>/dev/null
wait "$LIVE" 2>/dev/null
exit $code
