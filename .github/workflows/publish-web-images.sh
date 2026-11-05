#!/usr/bin/env bash
set -euo pipefail

printf '%s' "$REGISTRY_PASSWORD" |
  docker login ghcr.io --username "$REGISTRY_USERNAME" --password-stdin

local_image="$IMAGE_REPOSITORY/web:$IMAGE_TAG"
remote_image="$GHCR_NAMESPACE/web:$IMAGE_TAG"
docker tag "$local_image" "$remote_image"

# GHCR intermittently rejects a push with "unknown blob". Re-pushing the same local image
# is idempotent -- uploaded layers are skipped and the tag still names the tested image --
# so a few short, bounded attempts replace an ejected merge-queue run. A healthy push
# takes about ten seconds.
#
# The digest is read back from the push output rather than from `docker image
# inspect`, whose RepoDigests can carry entries for other repositories.
for attempt in 1 2 3; do
  if push_output=$(timeout 75 docker push "$remote_image"); then
    break
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "::error::docker push of $remote_image failed after $attempt attempts."
    exit 1
  fi
  echo "::warning::docker push attempt $attempt failed; retrying."
  sleep $((attempt * 5))
done
printf '%s\n' "$push_output"
digest=$(printf '%s\n' "$push_output" |
  sed -n 's/.*[[:space:]]digest: \(sha256:[0-9a-f]\{64\}\).*/\1/p' | head -1)
if [ -z "$digest" ]; then
  echo "::error::$remote_image was pushed but no digest could be read back."
  exit 1
fi

printf 'web_digest=%s\n' "$digest" >> "$GITHUB_OUTPUT"

echo "✓ published $remote_image ($digest)"
{
  echo "## Published web image"
  echo ""
  echo "- \`$remote_image\` — \`$digest\`"
} >> "$GITHUB_STEP_SUMMARY"
