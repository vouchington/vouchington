#!/usr/bin/env bash
# Prunes runtime image versions from GHCR. Merge groups, and main when a merge-group image is
# missing, publish ghcr.io/<owner>/<package>:sha-<commit> with a provenance attestation.
# vouchington-infra copies each deployed main revision into ECR by digest, and deploys and rollbacks
# read ECR, so GHCR only has to hold recent main revisions and in-flight merge-group images.
#
# Run from a full-history checkout of main. Each version is one of:
# - An image, with a tag other than sha256-*. Only an image whose single tag is sha-<40 hex> is
#   deleted: past the newest $GHCR_KEEP_MAIN commits reachable from HEAD, or unreachable (an
#   ejected or failed merge group) once created and updated $GHCR_UNMERGED_MIN_AGE_DAYS ago.
# - An attachment: untagged or tagged only sha256-*. Attestations and their referrer indexes are
#   pushed after their image, and platform manifests moments before it, so an attachment created
#   over a day before the oldest surviving image, and idle for the same age, belongs to none.
#
# Defaults to a dry run. Pass --apply to delete.
set -euo pipefail

owner=${GHCR_OWNER:-vouchington}
packages=${GHCR_PACKAGES:-api worker-cpu worker-io web}
keep_main=${GHCR_KEEP_MAIN:-30}
min_age_days=${GHCR_UNMERGED_MIN_AGE_DAYS:-7}
apply=false

for argument in "$@"; do
  case "$argument" in
    --apply) apply=true ;;
    --dry-run) apply=false ;;
    *)
      echo "unknown argument: $argument" >&2
      exit 2
      ;;
  esac
done

# A zero keep count would delete every main image in one run.
case "$keep_main" in
  '' | *[!0-9]*) keep_main=0 ;;
esac
if [ "$((10#$keep_main))" -lt 1 ]; then
  echo 'GHCR_KEEP_MAIN must be a positive integer' >&2
  exit 2
fi
case "$min_age_days" in
  '' | *[!0-9]*)
    echo 'GHCR_UNMERGED_MIN_AGE_DAYS must be a non-negative integer' >&2
    exit 2
    ;;
esac

# A shallow history would make every older main revision look unmerged.
if [ "$(git rev-parse --is-shallow-repository)" != false ]; then
  echo 'ghcr-package-retention.sh needs the full main history (fetch-depth: 0)' >&2
  exit 2
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git rev-list HEAD > "$work/main-revisions"
cutoff=$(($(date -u +%s) - min_age_days * 86400))

plan='
  ($revisions | split("\n") | map(select(. != "") | {key: ., value: true}) | from_entries) as $main
  | (add // []) as $versions
  | def tags: .metadata.container.tags;
    def created: .created_at | fromdateiso8601;
    def idle: [.created_at, .updated_at] | map(fromdateiso8601) | max < $cutoff;
    def attachment: tags | all(startswith("sha256-"));
    def canonical: tags | length == 1 and (.[0] | test("^sha-[0-9a-f]{40}$"));
    def merged: $main[tags[0][4:]] == true;
    ($versions | map(select(canonical and merged)) | sort_by(.created_at, .id) | reverse
      | .[$keep:] | map(. + {reason: "main"})) as $old_main
    | ($versions | map(select(canonical and (merged | not) and idle) | . + {reason: "unmerged"}))
      as $unmerged
    | ($old_main + $unmerged | map(.id)) as $doomed
    | ($versions | map(select((attachment | not) and (.id | IN($doomed[]) | not)) | created)
      | min) as $oldest_image
    | ($versions | map(select(attachment and idle and $oldest_image != null
        and created < $oldest_image - 86400) | . + {reason: "orphan"})) as $orphans
    | ($old_main + $unmerged + $orphans)[]
    | "\(.id) \(tags | if length == 0 then "<untagged>" else join(",") end) \(.reason)"'

deleted_total=0
for package in $packages; do
  path="/orgs/$owner/packages/container/$package/versions"
  if ! error=$(gh api --paginate "$path?per_page=100" 2>&1 > "$work/pages"); then
    case "$error" in
      # worker-io exists only once WORKER_IO_AUTOMATION_ENABLED has published it.
      *'(HTTP 404)'*)
        echo "· $package: no such package, skipping"
        continue
        ;;
    esac
    printf '::error::Could not list %s versions: %s\n' "$package" "$error" >&2
    exit 1
  fi

  deletions=$(jq -r -s --rawfile revisions "$work/main-revisions" --argjson keep "$keep_main" \
    --argjson cutoff "$cutoff" "$plan" "$work/pages")
  echo "· $package: $(jq -s 'add // [] | length' "$work/pages") version(s)"
  while read -r id tags reason; do
    [ -n "$id" ] || continue
    if [ "$apply" = true ]; then
      gh api --method DELETE "$path/$id" > /dev/null < /dev/null
      echo "  deleted $id $tags ($reason)"
    else
      echo "  would delete $id $tags ($reason)"
    fi
    deleted_total=$((deleted_total + 1))
  done <<< "$deletions"
done

if [ "$apply" = true ]; then
  echo "Deleted $deleted_total version(s)."
else
  echo "Dry run: $deleted_total version(s) would be deleted. Pass --apply to delete."
fi
