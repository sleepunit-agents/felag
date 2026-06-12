#!/usr/bin/env bash
# Cold review: a context-stripped Claude (no loom, no global CLAUDE.md, no
# MCP servers — still on subscription auth) reviews adversarially. The
# reviewer's ignorance is the method: it finds what insiders structurally
# cannot. Validated on every felag design round to date.
#
# Usage:
#   scripts/cold-review.sh path/to/prompt.txt
#   echo "review HEAD adversarially..." | scripts/cold-review.sh
set -euo pipefail

EMPTY_MCP=$(mktemp)
printf '{"mcpServers":{}}' > "$EMPTY_MCP"
trap 'rm -f "$EMPTY_MCP"' EXIT

if [ $# -ge 1 ] && [ -f "$1" ]; then
  exec claude -p --setting-sources project --strict-mcp-config --mcp-config "$EMPTY_MCP" < "$1"
else
  exec claude -p --setting-sources project --strict-mcp-config --mcp-config "$EMPTY_MCP"
fi
