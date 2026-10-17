#!/usr/bin/env bash
# Commit ledger progress to the ref the workflow runs on, so progress is visible outside the run.
set -e
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add data-state/bill_ledger
if git diff --cached --quiet; then echo "No ledger changes"; exit 0; fi
git commit -q -m "$1"
git fetch -q origin "$GITHUB_REF_NAME"
git rebase -q "origin/$GITHUB_REF_NAME"
git push -q origin "HEAD:$GITHUB_REF_NAME"
echo "pushed: $1"
