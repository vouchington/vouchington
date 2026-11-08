#!/usr/bin/env bash
if ! command -v trivy >/dev/null 2>&1; then
  echo "✗ Trivy was not installed — container scans cannot run." >> "$GITHUB_STEP_SUMMARY"
  exit 1
fi
