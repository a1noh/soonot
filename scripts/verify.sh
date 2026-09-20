#!/usr/bin/env bash
# Typecheck AND test, failing loudly on either. A previous commit slipped
# through with a type error because tsc's output was piped into `head`.
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
echo "── tsc ───────────────────────────────"
npx tsc -b master bingo yutnori
echo "── vitest ────────────────────────────"
npx vitest run
