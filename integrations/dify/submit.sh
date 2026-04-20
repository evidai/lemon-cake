#!/usr/bin/env bash
# One-shot Dify Marketplace PR submission script.
# Prereq: `gh auth login` must be complete (run it in your terminal first).
#
# Usage:
#   bash integrations/dify/submit.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="$REPO_ROOT/integrations/dify/dist/lemoncake-0.0.1.difypkg"
PR_BODY="$REPO_ROOT/integrations/dify/PR_BODY.md"
WORKDIR="${WORKDIR:-/tmp/dify-plugins-submit}"

if ! command -v gh >/dev/null; then
  echo "❌ gh CLI not found. Install with: brew install gh" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh not authenticated. Run: gh auth login" >&2
  exit 1
fi

[[ -f "$PKG" ]]      || { echo "❌ package missing: $PKG" >&2; exit 1; }
[[ -f "$PR_BODY" ]]  || { echo "❌ PR body missing: $PR_BODY" >&2; exit 1; }

echo "📦 Package: $PKG ($(du -h "$PKG" | cut -f1))"

mkdir -p "$WORKDIR"
cd "$WORKDIR"

if [[ ! -d dify-plugins ]]; then
  echo "🍴 Forking langgenius/dify-plugins..."
  gh repo fork langgenius/dify-plugins --clone --fork-name dify-plugins
fi

cd dify-plugins
git fetch origin
git checkout main 2>/dev/null || git checkout -b main origin/main
git pull --rebase origin main || true

BRANCH="feat/lemoncake-0.0.1"
git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

mkdir -p lemoncake/lemoncake
cp "$PKG" lemoncake/lemoncake/

git add lemoncake/lemoncake/lemoncake-0.0.1.difypkg
git commit -m "feat(lemoncake): add lemoncake plugin 0.0.1" || echo "ℹ️  nothing new to commit"
git push -u origin "$BRANCH"

echo "🚀 Creating PR..."
gh pr create \
  --repo langgenius/dify-plugins \
  --title "feat(lemoncake): add LemonCake plugin 0.0.1" \
  --body-file "$PR_BODY" \
  --head "$(gh api user -q .login):$BRANCH" \
  --base main

echo "✅ PR submitted. Track it with:  gh pr list --repo langgenius/dify-plugins --author @me"
