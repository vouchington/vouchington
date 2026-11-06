#!/usr/bin/env bash
set -euo pipefail
VERSION="$(pnpm exec pr-shepherd --version)"
echo "Trusted pr-shepherd version (from main): $VERSION"
echo "version=$VERSION" >> "$GITHUB_OUTPUT"
