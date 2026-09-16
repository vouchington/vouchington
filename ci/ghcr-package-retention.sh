#!/usr/bin/env bash
# Prune published container package versions from GHCR.
#
# main-backend.yml publishes one image per component per main revision, so these packages grow
# without bound unless something reaps them. GHCR is only a transfer medium: vouchington-infra
# copies each image into ECR by digest, and deployments and rollbacks read from ECR. Removing an
# old GHCR version therefore cannot affect a running service -- it only removes the ability to
# re-copy that revision, which is why a generous window of recent versions is kept.
#
# Defaults are dry-run. Pass --apply to actually delete.
set -euo pipefail

owner="${GHCR_OWNER:-vouchington}"
packages="${GHCR_PACKAGES:-api worker-cpu worker-io}"
keep_tagged="${GHCR_KEEP_TAGGED:-30}"
untagged_min_age_days="${GHCR_UNTAGGED_MIN_AGE_DAYS:-7}"
apply=false

for argument in "$@"; do
  case "$argument" in
    --apply) apply=true ;;
    --dry-run) apply=false ;;
    *) echo "unknown argument: $argument" >&2; exit 2 ;;
  esac
done

case "$keep_tagged" in
  '' | *[!0-9]*) echo 'GHCR_KEEP_TAGGED must be a non-negative integer' >&2; exit 2 ;;
esac
case "$untagged_min_age_days" in
  '' | *[!0-9]*) echo 'GHCR_UNTAGGED_MIN_AGE_DAYS must be a non-negative integer' >&2; exit 2 ;;
esac

# A zero keep count would empty the package in one run. Refuse it rather than trust the caller.
if [ "$keep_tagged" -lt 1 ]; then
  echo 'GHCR_KEEP_TAGGED must be at least 1' >&2
  exit 2
fi

cutoff_epoch=$(( $(date -u +%s) - untagged_min_age_days * 86400 ))
deleted_total=0
kept_total=0

for package in $packages; do
  # A package that has never been published is not an error: worker-io only exists while
  # WORKER_IO_AUTOMATION_ENABLED is true.
  if ! versions=$(gh api --paginate \
    "/orgs/${owner}/packages/container/${package}/versions?per_page=100" 2>/dev/null); then
    echo "· ${package}: no such package, skipping"
    continue
  fi

  # Newest first, so the first $keep_tagged tagged versions are the ones to keep.
  tagged_delete=$(printf '%s' "$versions" | jq --argjson keep "$keep_tagged" -r '
    [.[] | select((.metadata.container.tags | length) > 0)]
      | sort_by(.created_at) | reverse | .[$keep:] | .[] | "\(.id) \(.metadata.container.tags | join(","))"')

  untagged_delete=$(printf '%s' "$versions" | jq --argjson cutoff "$cutoff_epoch" -r '
    [.[] | select((.metadata.container.tags | length) == 0)]
      | .[] | select((.created_at | fromdateiso8601) < $cutoff) | "\(.id) <untagged>"')

  kept=$(printf '%s' "$versions" | jq --argjson keep "$keep_tagged" -r '
    [.[] | select((.metadata.container.tags | length) > 0)] | .[:$keep] | length')
  kept_total=$(( kept_total + kept ))

  echo "· ${package}: keeping ${kept} tagged version(s)"

  while read -r id label; do
    [ -n "$id" ] || continue
    if [ "$apply" = true ]; then
      gh api --method DELETE "/orgs/${owner}/packages/container/${package}/versions/${id}"
      echo "  deleted ${package} ${id} (${label})"
    else
      echo "  would delete ${package} ${id} (${label})"
    fi
    deleted_total=$(( deleted_total + 1 ))
  done <<EOF
${tagged_delete}
${untagged_delete}
EOF
done

if [ "$apply" = true ]; then
  echo "Deleted ${deleted_total} version(s); kept ${kept_total} recent tagged version(s)."
else
  echo "Dry run: ${deleted_total} version(s) would be deleted; ${kept_total} kept. Pass --apply to delete."
fi
