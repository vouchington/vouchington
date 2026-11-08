#!/usr/bin/env bash
set -euo pipefail
image="$IMAGE_REPOSITORY/web:$IMAGE_TAG"
trivy_exit=0
trivy image \
  --scanners vuln \
  --quiet \
  --pkg-types os \
  --skip-db-update \
  --exit-code "$TRIVY_FINDINGS_EXIT_CODE" \
  --severity CRITICAL,HIGH \
  --ignore-unfixed \
  --ignorefile .trivyignore.yaml \
  --format table \
  --table-mode detailed \
  --output trivy-web-os-table.txt \
  "$image" 2> trivy-web-os-stderr.txt || trivy_exit=$?
if [ "$trivy_exit" -eq "$TRIVY_FINDINGS_EXIT_CODE" ]; then
  echo "::error title=Trivy OS vulnerability findings::CRITICAL/HIGH fixable OS vulnerabilities were found in $image."
  {
    echo "## Trivy OS Package Scan — Web"
    echo ""
    echo "⚠️ CRITICAL/HIGH fixable OS vulnerabilities were found."
    echo ""
    echo '```'
    cat trivy-web-os-table.txt
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
  cat trivy-web-os-table.txt
  exit "$trivy_exit"
elif [ "$trivy_exit" -ne 0 ]; then
  echo "::error title=Trivy scanner error::Trivy could not complete the OS package scan for $image (exit $trivy_exit)."
  echo "✗ Trivy scanner error while scanning OS packages in $image (exit $trivy_exit)"
  cat trivy-web-os-stderr.txt >&2
  exit "$trivy_exit"
fi
