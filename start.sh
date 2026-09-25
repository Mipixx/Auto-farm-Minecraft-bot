#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

# mineflayer@master needs Node >= 22
for candidate in \
  "$HOME/.local/node22/bin/node" \
  "$HOME/.local/share/cursor-agent/versions/"*/node \
  "$(command -v node || true)"
do
  if [[ -x "$candidate" ]]; then
    ver="$("$candidate" -v 2>/dev/null | sed 's/^v//')"
    major="${ver%%.*}"
    if [[ "${major:-0}" -ge 22 ]]; then
      NODE="$candidate"
      break
    fi
  fi
done

if [[ -z "${NODE:-}" ]]; then
  echo "Need Node >= 22 for Minecraft 26.1 support." >&2
  exit 1
fi

export MC_HOST="${MC_HOST:-localhost}"
export MC_PORT="${MC_PORT:-25565}"
export MC_USERNAME="${MC_USERNAME:-Farmer}"
export MC_AUTH="${MC_AUTH:-offline}"
export MC_VERSION="${MC_VERSION:-26.1}"

echo "Using $($NODE -v) -> $NODE"
exec "$NODE" "$ROOT/bot.js"
