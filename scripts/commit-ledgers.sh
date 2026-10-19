#!/usr/bin/env bash
# Commit ledger progress to the ref the workflow runs on, so progress is visible outside the run.
set -e
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add ${COMMIT_PATH:-data-state/bill_ledger}
if git diff --cached --quiet; then echo "No ledger changes"; exit 0; fi
git commit -q -m "$1"
bash "$(dirname "$0")/push-main.sh" "$GITHUB_REF_NAME"
echo "pushed: $1"
