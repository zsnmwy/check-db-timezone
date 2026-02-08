#!/usr/bin/env bash
set -euo pipefail

scan_if_exists() {
  local path="$1"
  local pattern="$2"
  local description="$3"

  if [ ! -e "$path" ]; then
    echo "[check-time-policy] skip missing path: $path"
    return 0
  fi

  if rg -n --glob '!**/probes/**' "$pattern" "$path"; then
    echo "❌ Time policy violation: $description"
    exit 1
  fi
}

scan_if_exists "prisma/schema.prisma" "\\bDateTime\\b|@updatedAt" "业务 Prisma schema 禁止 DateTime/@updatedAt"
scan_if_exists "src/drizzle/schema.ts" "timestamp\\(|timestamptz|timestamp with time zone" "业务 Drizzle schema 禁止 timestamp/timestamptz"
scan_if_exists "migrations" "timestamp\\b|timestamptz\\b|DateTime\\b" "业务 migrations 禁止事实时间列使用 timestamp/timestamptz/DateTime"

echo "✅ Time policy scan passed"
