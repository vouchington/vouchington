#!/usr/bin/env bash
set -euo pipefail
STORYBOOK_BASE_PATH=/ pnpm run build:storybook
node ci/storybook-pages.mts protect web/storybook-static
mkdir -p delivery
mv web/storybook-static delivery/storybook
