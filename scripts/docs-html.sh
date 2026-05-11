#!/usr/bin/env bash
# shellcheck shell=bash
# docs-html.sh — Regenerate all docs/**/*.html from their .md sources.
#
# Usage: bash scripts/docs-html.sh   (or: make docs-html)
# Requires: pandoc 2.x+

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS="$REPO_ROOT/docs"

if ! command -v pandoc &>/dev/null; then
  echo "✗ pandoc not found — install it from https://pandoc.org/installing.html"
  exit 1
fi

# Find all .md files under docs/
count=0

while IFS= read -r md; do
  dir="$(dirname "$md")"
  base="$(basename "$md" .md)"
  html="$dir/$base.html"

  # Compute relative path from this subdir back to docs/
  rel="$(python3 -c "import os; print(os.path.relpath('$DOCS', '$dir'))")"
  css="$rel/style.css"

  title="$(head -1 "$md" | sed 's/^#* *//')"

  pandoc "$md" \
    --standalone \
    --metadata "title=$title" \
    --variable "css=$css" \
    -o "$html"

  # Inject back-link after <body>
  sed -i.bak "s|<body>|<body>\n<a href='$rel/index.html' class='back-link'>← Back to Hub</a>|" "$html"
  rm -f "$html.bak"

  echo "  ✓ $html"
  count=$((count + 1))
done < <(find "$DOCS" -name "*.md" | sort)

echo ""
echo "✓ docs-html: $count pages generated"
