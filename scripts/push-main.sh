#!/usr/bin/env bash
# Push HEAD to a branch in a way that survives what kills unattended data jobs:
#   - a concurrent bot commit landing first (non-fast-forward), and
#   - a transient GitHub 5xx ("remote: Internal Server Error").
# --autostash lets the rebase proceed even when a refresh left unstaged files.
# usage: bash scripts/push-main.sh [branch]   (default: $GITHUB_REF_NAME, else main)
set -u
branch="${1:-${GITHUB_REF_NAME:-main}}"
for attempt in 1 2 3 4 5 6; do
  if git fetch -q origin "$branch" && git rebase -q --autostash "origin/$branch" && git push -q origin "HEAD:$branch"; then
    echo "pushed to $branch (attempt $attempt)"
    exit 0
  fi
  git rebase --abort 2>/dev/null || true
  echo "push attempt $attempt failed; retrying in $((attempt * 6))s" >&2
  sleep $((attempt * 6))
done
echo "::error::could not push to $branch after 6 attempts" >&2
exit 1
