#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --coverage
pnpm build
if [[ "${E2E:-0}" == "1" ]]; then
  pnpm exec playwright install --with-deps chromium
  pnpm e2e
fi
