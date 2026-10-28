#!/usr/bin/env bash
set -euo pipefail

if [ ! -x "${HOME}/.local/bin/mise" ]; then
  curl -fsSL https://mise.run/bash | sh
fi

export PATH="${HOME}/.local/bin:${PATH}"
eval "$(mise activate bash)"

cd /workspace
mise trust --yes
mise install
mise reshim

corepack enable
corepack prepare pnpm@12.6.0 --activate
mise reshim

pnpm install --frozen-lockfile
pnpm --dir apps/web exec playwright install --with-deps chromium
pnpm --dir apps/web build

# Cloud Agent Skills menu and runtime read ~/.cursor/skills-cursor. Existing skill folders are left in place.
curl -fsSL https://raw.githubusercontent.com/nikolaybotev/local-skills/main/install.sh | sh -s -- ~/.cursor/skills-cursor
