#!/usr/bin/env bash
# Decides which merge-queue images a main push can reuse. The merge group for this exact commit
# built, tested, pushed and attested ghcr.io/<owner>/<target>:sha-<commit>. A present image must
# carry that provenance or this fails; only an absent image is left for the main fallback build.
# Needs `docker login ghcr.io` and GH_TOKEN. Writes missing_targets as a JSON array to GITHUB_OUTPUT.
set -euo pipefail

group=${1:-}
case "$group" in
  backend)
    worker_io=$(sed -n 's/^WORKER_IO_AUTOMATION_ENABLED=//p' .github/worker-io-automation.env)
    case "$worker_io" in
      true) targets='api worker-cpu worker-io' ;;
      false) targets='api worker-cpu' ;;
      *)
        echo '::error::WORKER_IO_AUTOMATION_ENABLED must be true or false' >&2
        exit 1
        ;;
    esac
    ;;
  web) targets=web ;;
  *)
    echo 'usage: resolve-published-images.sh <backend|web>' >&2
    exit 2
    ;;
esac

# Merge groups sign from gh-readonly-queue/main/*. A previous main fallback signed from main.
repository=${GITHUB_REPOSITORY//./\\.}
publisher="https://github\\.com/$repository/\\.github/workflows/publish-$group-images\\.yml"
identity="^$publisher@(?:refs/heads/main|refs/heads/gh-readonly-queue/main/[^\\s@]+)\$"

missing=''
for target in $targets; do
  image="ghcr.io/$GITHUB_REPOSITORY_OWNER/$target:sha-$GITHUB_SHA"
  if ! inspect_error=$(docker manifest inspect "$image" 2>&1 >/dev/null); then
    case "$inspect_error" in
      *'manifest unknown'* | *'no such manifest'*)
        missing="$missing $target"
        continue
        ;;
    esac
    printf '::error::Could not read %s: %s\n' "$image" "$inspect_error" >&2
    exit 1
  fi
  if ! gh attestation verify "oci://$image" --bundle-from-oci --repo "$GITHUB_REPOSITORY" \
    --source-digest "$GITHUB_SHA" --signer-digest "$GITHUB_SHA" --deny-self-hosted-runners \
    --cert-identity-regex "$identity" >/dev/null; then
    echo "::error::$image exists without trusted provenance for this commit." >&2
    exit 1
  fi
  echo "Reusing $image"
done

missing_targets=$(jq -cn --arg targets "$missing" '$targets | split(" ") | map(select(. != ""))')
echo "missing_targets=$missing_targets" >> "$GITHUB_OUTPUT"
if [ "$missing_targets" != '[]' ]; then
  echo "::warning::Merge-queue $group images are missing: $missing_targets. Building them once."
  printf '## %s image fallback\n\nMissing merge-queue images: %s.\n' \
    "$group" "$missing_targets" >> "$GITHUB_STEP_SUMMARY"
fi
