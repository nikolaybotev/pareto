#!/usr/bin/env bash
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
eval "$(mise activate bash)"
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:5173/; then
  exit 0
fi
if [ ! -f apps/web/dist/index.html ]; then
  pnpm --dir apps/web build
fi
exec pnpm --dir apps/web exec vite preview --host 0.0.0.0 --port 5173 --strictPort
