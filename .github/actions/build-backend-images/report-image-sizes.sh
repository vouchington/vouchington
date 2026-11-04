#!/usr/bin/env bash
# Writes each built image size to the job summary.
set -euo pipefail
{
  echo "## Docker Image Sizes"
  echo ""
} >> "$GITHUB_STEP_SUMMARY"
for target in api $ACTIVE_WORKER_IMAGES; do
  entry="$target:$IMAGE_TAG"
  target="${entry%%:*}"
  tag="${entry#*:}"
  image="$IMAGE_REPOSITORY/$target:$tag"
  bytes=$(docker image inspect "$image" --format '{{.Size}}')
  size=$(numfmt --to=iec-i --suffix=B "$bytes")
  echo "$target image size: $size ($bytes bytes)"
  {
    echo "- \`$image\` — \`$size\` ($bytes bytes)"
  } >> "$GITHUB_STEP_SUMMARY"
done
