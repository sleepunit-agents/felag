#!/usr/bin/env bash
# Cold review: a context-stripped Claude (no loom, no global CLAUDE.md, no
# MCP servers — still on subscription auth) reviews adversarially. The
# reviewer's ignorance is the method: it finds what insiders structurally
# cannot. Validated on every felag design round to date.
#
# Usage:
#   scripts/cold-review.sh [--smells] path/to/prompt.txt
#   echo "review HEAD adversarially..." | scripts/cold-review.sh [--smells]
#
# --smells  appends scripts/cold-review-smells.md (the two-axis Standards /
#           Spec brief with the Fowler smell baseline) to the prompt. Use it
#           when the artifact under review is CODE, not a spec.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMELLS=0
if [ "${1:-}" = "--smells" ]; then SMELLS=1; shift; fi

EMPTY_MCP=$(mktemp)
PROMPT=$(mktemp)
printf '{"mcpServers":{}}' > "$EMPTY_MCP"
trap 'rm -f "$EMPTY_MCP" "$PROMPT"' EXIT

if [ $# -ge 1 ] && [ -f "$1" ]; then
  cat "$1" > "$PROMPT"
else
  cat > "$PROMPT"
fi
if [ "$SMELLS" = 1 ]; then
  printf '\n\n' >> "$PROMPT"
  cat "$HERE/cold-review-smells.md" >> "$PROMPT"
fi

claude -p --setting-sources project --strict-mcp-config --mcp-config "$EMPTY_MCP" < "$PROMPT"
