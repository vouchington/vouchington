#!/usr/bin/env bash
# Gating already happened in "Scan OS packages in web image with Trivy" above; this step
# only runs once that step has passed, so an exit-code/severity filter
# here can never trigger. Keep the SBOM free of vulnerability filters so it
# remains a complete OS and language package component inventory for the
# uploaded artifact, not a truncated gate report.
trivy image \
  --quiet \
  --skip-db-update \
  --exit-code 0 \
  --format cyclonedx \
  --output sbom-web.cdx.json \
  "$IMAGE_REPOSITORY/web:$IMAGE_TAG"
