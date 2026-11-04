#!/usr/bin/env bash
# Gates on CRITICAL/HIGH fixable OS vulnerabilities in every built image.
set -euo pipefail
findings_detected=0
scan_error_exit=0
for target in api $ACTIVE_WORKER_IMAGES; do
  image="$IMAGE_REPOSITORY/$target:$IMAGE_TAG"
  target_exit=0
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
    --output "trivy-${target}-os-table.txt" \
    "$image" 2> "trivy-${target}-os-stderr.txt" || target_exit=$?
  if [ "$target_exit" -eq "$TRIVY_FINDINGS_EXIT_CODE" ]; then
    findings_detected=1
    echo "::error title=Trivy OS vulnerability findings::$target contains CRITICAL/HIGH fixable OS vulnerabilities."
    {
      echo "### $target"
      echo ""
      echo '```'
      cat "trivy-${target}-os-table.txt"
      echo '```'
      echo ""
    } >> "$GITHUB_STEP_SUMMARY"
    cat "trivy-${target}-os-table.txt"
  elif [ "$target_exit" -ne 0 ]; then
    if [ "$scan_error_exit" -eq 0 ]; then
      scan_error_exit="$target_exit"
    fi
    echo "::error title=Trivy scanner error::Trivy could not complete the OS package scan for $image (exit $target_exit)."
    echo "✗ Trivy scanner error while scanning OS packages in $image (exit $target_exit)"
    cat "trivy-${target}-os-stderr.txt" >&2
  fi
done
if [ "$scan_error_exit" -ne 0 ]; then
  if [ "$findings_detected" -ne 0 ]; then
    echo "✗ Trivy scanner error for one or more images; OS vulnerability findings were also detected"
  else
    echo "✗ Trivy scanner error for one or more images"
  fi
  exit "$scan_error_exit"
fi
if [ "$findings_detected" -ne 0 ]; then
  echo "✗ Trivy found CRITICAL/HIGH fixable OS vulnerabilities in one or more images"
  exit "$TRIVY_FINDINGS_EXIT_CODE"
fi
