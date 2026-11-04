#!/usr/bin/env bash
# Fails the job when Trivy is missing, because the image scans cannot run without it.
set -euo pipefail
if ! command -v trivy >/dev/null 2>&1; then
  echo "✗ Trivy was not installed — container scans cannot run." >> "$GITHUB_STEP_SUMMARY"
  exit 1
fi
