#!/usr/bin/env bash
set -euo pipefail

# A main push publishes only what the merge group did not; a merge group publishes all.
if [ "$GITHUB_EVENT_NAME" = push ]; then
  targets=$(jq -r '.[]' <<<"$MISSING_TARGETS")
else
  targets="api $ACTIVE_WORKER_IMAGES"
fi

printf '%s' "$REGISTRY_PASSWORD" |
  docker login ghcr.io --username "$REGISTRY_USERNAME" --password-stdin

{
  echo "## Published backend images"
  echo ""
} >> "$GITHUB_STEP_SUMMARY"

for target in $targets; do
  local_image="${IMAGE_REPOSITORY}/$target:$IMAGE_TAG"
  remote_image="${GHCR_NAMESPACE}/$target:$IMAGE_TAG"
  docker tag "$local_image" "$remote_image"

  # GHCR intermittently rejects a push with "unknown blob". Re-pushing the same local image
  # is idempotent -- uploaded layers are skipped and the tag still names the tested image --
  # so a few short, bounded attempts replace an ejected merge-queue run.
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
    echo "::warning::docker push attempt $attempt of $remote_image failed; retrying."
    sleep $((attempt * 5))
  done
  printf '%s\n' "$push_output"
  digest=$(printf '%s\n' "$push_output" |
    sed -n 's/.*[[:space:]]digest: \(sha256:[0-9a-f]\{64\}\).*/\1/p' | head -1)
  if [ -z "$digest" ]; then
    echo "::error::$remote_image was pushed but no digest could be read back."
    exit 1
  fi

  case "$target" in
    api) output_name=api_digest ;;
    worker-cpu) output_name=worker_cpu_digest ;;
    worker-io) output_name=worker_io_digest ;;
    *) echo "::error::Unexpected backend image target: $target" ; exit 1 ;;
  esac
  printf '%s=%s\n' "$output_name" "$digest" >> "$GITHUB_OUTPUT"

  echo "✓ published $remote_image ($digest)"
  echo "- \`$remote_image\` — \`$digest\`" >> "$GITHUB_STEP_SUMMARY"
done
