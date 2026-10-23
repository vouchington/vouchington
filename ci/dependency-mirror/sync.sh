#!/usr/bin/env bash
set -euo pipefail
trap 'exit 130' INT
trap 'exit 143' TERM

config="${1:?Expected reviewed image manifest}"
owner="${GHCR_OWNER:?Expected GHCR owner}"
regctl="${REGCTL:?Expected verified regctl binary}"
token="${GHCR_TOKEN:?Expected GHCR write token}"

if ! [[ "$owner" =~ ^[A-Za-z0-9-]+$ ]]; then
  echo "Invalid GHCR owner" >&2
  exit 2
fi
if ! jq -e '
  .schemaVersion == 1 and
  (.images | type == "array" and length > 0 and
    all(.[];
      (.package | test("^dependency-[a-z0-9-]+$")) and
      (.source | test("^docker\\.io/[a-z0-9._/-]+$")) and
      (.tag | test("^[A-Za-z0-9_][A-Za-z0-9_.-]*$")) and
      (.digest | test("^sha256:[0-9a-f]{64}$"))
    )
  ) and
  ([.images[] | .package + ":" + .tag] | unique | length) == (.images | length)
' "$config" >/dev/null; then
  echo "Invalid or duplicate reviewed dependency image entry" >&2
  exit 2
fi

staging="$(mktemp -d "${RUNNER_TEMP:-/tmp}/dependency-mirror.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
jq -c '.images[]' "$config" > "$staging/entries.jsonl"

# Copy every approved digest, including every platform and layer, into one local OCI layout before
# publishing any GHCR tag. Separate refs share blobs when release tags resolve to the same index.
# A source tag is observed only for review; it never selects bytes.
index=0
while IFS= read -r entry; do
  index=$((index + 1))
  source="$(jq -r .source <<< "$entry")"
  tag="$(jq -r .tag <<< "$entry")"
  digest="$(jq -r .digest <<< "$entry")"
  stage="ocidir://$staging/source:entry-$index"
  actual="$("$regctl" image digest "$source@$digest")"
  if [ "$actual" != "$digest" ]; then
    echo "::error::Reviewed source digest mismatch for $source@$digest: $actual" >&2
    exit 1
  fi
  "$regctl" image copy --force-recursive "$source@$digest" "$stage"
  actual="$("$regctl" image digest "$stage")"
  if [ "$actual" != "$digest" ]; then
    echo "::error::Staged OCI index digest mismatch for $source@$digest: $actual" >&2
    exit 1
  fi
  current="$("$regctl" image digest "$source:$tag")"
  if [ "$current" != "$digest" ]; then
    echo "::warning::$source:$tag moved to $current; review a digest update in a separate PR" >&2
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      printf -- '- Review upstream update: %s:%s is %s; approved %s remains in use.\n' \
        "$source" "$tag" "$current" "$digest" >> "$GITHUB_STEP_SUMMARY"
    fi
  fi
  echo "Staged and verified $source@$digest"
done < "$staging/entries.jsonl"

# The write credential is first used after every source has passed local staging. Packages and
# immutable sha tags are intentionally separate from runtime images and never pruned here.
printf '%s' "$token" | "$regctl" registry login ghcr.io -u "${GITHUB_ACTOR:?}" --pass-stdin

# A 404 is the only admissible evidence that a tag is absent. Authentication failures,
# transport errors, and other registry responses stop publication without guessing.
lookup_digest() {
  local reference="$1" output
  if output="$("$regctl" image digest "$reference" 2> "$staging/lookup-error")"; then
    printf '%s\n' "$output"
    return 0
  fi
  if grep -Fq 'not found [http 404]' "$staging/lookup-error"; then
    return 4
  fi
  cat "$staging/lookup-error" >&2
  return 1
}

index=0
while IFS= read -r entry; do
  index=$((index + 1))
  package="$(jq -r .package <<< "$entry")"
  tag="$(jq -r .tag <<< "$entry")"
  digest="$(jq -r .digest <<< "$entry")"
  source="$(jq -r .source <<< "$entry")"
  stage="ocidir://$staging/source:entry-$index"
  target="ghcr.io/$owner/$package"
  candidate="$target:candidate-${digest#sha256:}"
  approved="$target:sha-${digest#sha256:}"
  tracked="$target:$tag"

  if actual="$(lookup_digest "$approved")"; then
    if [ "$actual" != "$digest" ]; then
      echo "::error::Immutable approved tag has a different digest: $approved" >&2
      exit 1
    fi
    # A matching HEAD does not prove its child manifests and blobs are still present.
    "$regctl" image copy --force-recursive "$stage" "$approved"
  else
    lookup_status=$?
    if [ "$lookup_status" -ne 4 ]; then
      exit "$lookup_status"
    fi
    if actual="$(lookup_digest "$candidate")"; then
      if [ "$actual" != "$digest" ]; then
        echo "::error::Immutable candidate tag has a different digest: $candidate" >&2
        exit 1
      fi
      # Repair a prior interrupted copy even when the index itself is present.
      "$regctl" image copy --force-recursive "$stage" "$candidate"
    else
      lookup_status=$?
      if [ "$lookup_status" -ne 4 ]; then
        exit "$lookup_status"
      fi
      "$regctl" image copy --force-recursive "$stage" "$candidate"
      actual="$("$regctl" image digest "$candidate")"
      if [ "$actual" != "$digest" ]; then
        echo "::error::GHCR candidate digest mismatch for $candidate: $actual" >&2
        exit 1
      fi
    fi
    "$regctl" image copy --force-recursive "$candidate" "$approved"
    actual="$("$regctl" image digest "$approved")"
    if [ "$actual" != "$digest" ]; then
      echo "::error::GHCR approved digest mismatch for $approved: $actual" >&2
      exit 1
    fi
  fi

  # Read the published image back into a fresh OCI layout before advancing the tracked tag.
  # This fetches every platform manifest and blob, so a matching HEAD cannot hide damage.
  roundtrip="ocidir://$staging/verify-$index:copied"
  "$regctl" image copy --force-recursive "$target@$digest" "$roundtrip"
  actual="$("$regctl" image digest "$roundtrip")"
  if [ "$actual" != "$digest" ]; then
    echo "::error::GHCR roundtrip digest mismatch for $source: $actual" >&2
    exit 1
  fi
  rm -rf "$staging/verify-$index"
  if actual="$(lookup_digest "$tracked")"; then
    if [ "$actual" != "$digest" ]; then
      "$regctl" image copy --force-recursive "$approved" "$tracked"
    fi
  else
    lookup_status=$?
    if [ "$lookup_status" -ne 4 ]; then
      exit "$lookup_status"
    fi
    "$regctl" image copy --force-recursive "$approved" "$tracked"
  fi
  actual="$("$regctl" image digest "$tracked")"
  if [ "$actual" != "$digest" ]; then
    echo "::error::GHCR reviewed tag digest mismatch for $tracked: $actual" >&2
    exit 1
  fi
  echo "Verified $approved ($digest)"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf -- '- %s@%s copied to %s and verified.\n' \
      "$source" "$digest" "$approved" >> "$GITHUB_STEP_SUMMARY"
  fi
done < "$staging/entries.jsonl"
