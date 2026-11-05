#!/usr/bin/env bash
set -euo pipefail
IMAGE="$IMAGE_REPOSITORY/web:$IMAGE_TAG"
IMAGE_BYTES=$(docker image inspect "$IMAGE" --format '{{.Size}}')
IMAGE_SIZE=$(numfmt --to=iec-i --suffix=B "$IMAGE_BYTES")
echo "Web image size: $IMAGE_SIZE ($IMAGE_BYTES bytes)"
{
  echo "## Docker Image Size"
  echo ""
  echo "- Image: \`$IMAGE\`"
  echo "- Size: \`$IMAGE_SIZE\` ($IMAGE_BYTES bytes)"
} >> "$GITHUB_STEP_SUMMARY"
