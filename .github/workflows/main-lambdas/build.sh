#!/usr/bin/env bash
set -euo pipefail
pnpm --filter @lambdas/image-resize run build
unzip -t lambdas/image-resize/dist/function.zip
zipinfo -1 lambdas/image-resize/dist/function.zip | grep -Fxq index.mjs
mkdir -p delivery
cp lambdas/image-resize/dist/function.zip delivery/image-resize.zip
