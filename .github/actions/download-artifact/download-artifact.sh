#!/usr/bin/env bash
# Downloads same-run artifacts over the REST API and verifies each against its recorded digest.
# Every network call has a finite deadline so the step always exits once the files are on disk.
set -euo pipefail

api="${GITHUB_API_URL:-https://api.github.com}/repos/${ARTIFACT_REPOSITORY}"
name="${ARTIFACT_NAME:-}"
pattern="${ARTIFACT_PATTERN:-}"
merge="${ARTIFACT_MERGE_MULTIPLE:-false}"
expected_names="${ARTIFACT_EXPECTED_NAMES:-}"
wait_timeout="${ARTIFACT_WAIT_TIMEOUT_SECONDS:-120}"
poll_interval="${ARTIFACT_POLL_INTERVAL_SECONDS:-5}"

if [[ -n "$name" && -n "$pattern" ]]; then
  echo "::error::Set only one of name and pattern." >&2
  exit 1
fi

# curl's own retry covers one transport blip (a DNS resolve timeout or a 5xx, #5531); plain
# --retry skips DNS failures, hence --retry-all-errors. Each attempt keeps its --max-time deadline.
call() {
  curl --fail --silent --show-error --location --connect-timeout 10 --max-time "$1" \
    --retry 3 --retry-all-errors \
    --header "Authorization: Bearer ${GH_TOKEN}" \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2022-11-28' "${@:2}"
}

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

# The run's artifact listing is eventually consistent: it can omit an artifact a finished job just
# uploaded (#5673), so a pattern download alone cannot tell a partial listing from a complete one.
list_artifacts() {
  artifacts='[]'
  local page=1
  while :; do
    call 30 -o "$scratch/page.json" "${api}/actions/runs/${ARTIFACT_RUN_ID}/artifacts?per_page=100&page=${page}"
    artifacts="$(jq -c --slurpfile next "$scratch/page.json" '. + ($next[0].artifacts | map(select(.expired | not)))' <<<"$artifacts")"
    if [[ "$(jq '.artifacts | length' "$scratch/page.json")" -lt 100 ]]; then break; fi
    page=$((page + 1))
  done
}

# Prints each expected name absent from the current listing.
missing_names() {
  local expected
  for expected in ${expected_names//,/ }; do
    jq -e --arg n "$expected" 'any(.[]; .name == $n)' <<<"$artifacts" >/dev/null || echo "$expected"
  done
}

list_artifacts
if [[ -n "$expected_names" ]]; then
  deadline=$((SECONDS + wait_timeout))
  while [[ -n "$(missing_names)" && "$SECONDS" -lt "$deadline" ]]; do
    echo "Waiting for artifacts not yet listed: $(missing_names | paste -sd, -)"
    sleep "$poll_interval"
    list_artifacts
  done
  missing="$(missing_names | paste -sd, -)"
  if [[ -n "$missing" ]]; then
    echo "::error::Artifacts missing from run ${ARTIFACT_RUN_ID} after ${wait_timeout}s: ${missing}." >&2
    exit 1
  fi
fi

matched=0
while IFS= read -r artifact; do
  artifact_name="$(jq -r .name <<<"$artifact")"
  if [[ -n "$name" ]]; then
    [[ "$artifact_name" == "$name" ]] || continue
  elif [[ -n "$pattern" ]]; then
    # shellcheck disable=SC2053
    [[ "$artifact_name" == $pattern ]] || continue
  fi
  matched=$((matched + 1))
  id="$(jq -r .id <<<"$artifact")"
  expected="$(jq -r '.digest // ""' <<<"$artifact")"
  if [[ "$expected" != sha256:* ]]; then
    echo "::error::Artifact ${artifact_name} has no SHA-256 digest to verify." >&2
    exit 1
  fi
  archive="$scratch/${id}.zip"
  call 120 -o "$archive" "${api}/actions/artifacts/${id}/zip"
  actual="sha256:$(sha256sum "$archive" | cut -d' ' -f1)"
  if [[ "$actual" != "$expected" ]]; then
    echo "::error::Artifact ${artifact_name} digest ${actual} does not match ${expected}." >&2
    exit 1
  fi
  destination="$ARTIFACT_PATH"
  if [[ -z "$name" && "$merge" != 'true' ]]; then destination="${destination}/${artifact_name}"; fi
  mkdir -p "$destination"
  unzip -q -o "$archive" -d "$destination"
  echo "Downloaded ${artifact_name} (${expected}) to ${destination}"
done < <(jq -c '.[]' <<<"$artifacts")

if [[ "$matched" -eq 0 ]]; then
  if [[ -n "$name" ]]; then
    echo "::error::No artifact named ${name} in run ${ARTIFACT_RUN_ID}." >&2
    exit 1
  fi
  echo "::warning::No artifacts matched in run ${ARTIFACT_RUN_ID}."
fi
