#!/usr/bin/env bash
# Writes a CycloneDX SBOM for every built image.
set -euo pipefail
# Gating already happened in "Scan OS packages in images with Trivy" above; this step only
# runs once that step has passed, so a vulnerability filter here can never
# trigger. Keep the SBOM free of vulnerability filters so it remains a
# complete OS and language package component inventory, not a truncated
# copy of the gate.
for target in api $ACTIVE_WORKER_IMAGES; do
  image="$IMAGE_REPOSITORY/$target:$IMAGE_TAG"
  trivy image \
    --quiet \
    --skip-db-update \
    --exit-code 0 \
    --format cyclonedx \
    --output "sbom-${target}.cdx.json" \
    "$image"
done
