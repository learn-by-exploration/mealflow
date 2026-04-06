#!/usr/bin/env bash
# Generate changelog from conventional commits
set -euo pipefail

SINCE="${1:-}"
if [ -n "$SINCE" ]; then
  RANGE="$SINCE..HEAD"
else
  RANGE=$(git tag --sort=-v:refname | head -1 2>/dev/null || echo "")
  if [ -n "$RANGE" ]; then
    RANGE="$RANGE..HEAD"
  else
    RANGE="HEAD"
  fi
fi

echo "# Changelog"
echo ""
echo "Generated: $(date -u +%Y-%m-%d)"
echo ""

for type_label in "feat:Features" "fix:Bug Fixes" "perf:Performance" "refactor:Refactoring" "docs:Documentation" "test:Tests" "ci:CI/CD" "chore:Chores"; do
  type="${type_label%%:*}"
  label="${type_label#*:}"
  commits=$(git log "$RANGE" --pretty=format:"- %s (%h)" --grep="^${type}" 2>/dev/null || true)
  if [ -n "$commits" ]; then
    echo "## $label"
    echo ""
    echo "$commits"
    echo ""
  fi
done

# Uncategorized
other=$(git log "$RANGE" --pretty=format:"%s|%h" 2>/dev/null | grep -vE "^(feat|fix|perf|refactor|docs|test|ci|chore)" | awk -F'|' '{print "- "$1" ("$2")"}' || true)
if [ -n "$other" ]; then
  echo "## Other"
  echo ""
  echo "$other"
  echo ""
fi
