#!/usr/bin/env bash
set -euo pipefail

command="${1:-}"
coverage_artifacts_dir="${COVERAGE_ARTIFACTS_DIR:-./coverage-artifacts}"
coverage_artifacts_merged_dir="${COVERAGE_ARTIFACTS_MERGED_DIR:-./coverage-artifacts-merged}"

if [ -n "${COVERAGE_CHECK_BIN:-}" ]; then
  coverage_check_bin="$COVERAGE_CHECK_BIN"
elif [ -x "./node_modules/.bin/coverage-check" ]; then
  coverage_check_bin="./node_modules/.bin/coverage-check"
elif [ -x "./ci/node_modules/.bin/coverage-check" ]; then
  coverage_check_bin="./ci/node_modules/.bin/coverage-check"
else
  coverage_check_bin="coverage-check"
fi
has_lcov_artifacts() {
  [ -d "$coverage_artifacts_dir" ] &&
    [ -n "$(find "$coverage_artifacts_dir" -type f -name lcov.info -print -quit)" ]
}

skip_without_lcov_artifacts() {
  local label="$1"
  if has_lcov_artifacts; then
    return 1
  fi

  echo "No LCOV artifacts found; skipping ${label} because no coverage-producing jobs ran."
  return 0
}

merge_coverage_artifacts() {
  "$coverage_check_bin" merge --artifacts "$coverage_artifacts_dir" --output "${coverage_artifacts_merged_dir}/lcov.info"
}

whitespace_only_ignore_args() {
  local base="${1:?base ref required}"
  local head="${2:?head ref required}"
  local content_changed_file all_changed_file normal_file

  content_changed_file="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/coverage-content-changed.XXXXXX")"
  all_changed_file="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/coverage-all-changed.XXXXXX")"
  git diff --name-only --ignore-space-at-eol "$base"..."$head" >"$content_changed_file"
  git diff --name-only "$base"..."$head" >"$all_changed_file"

  while IFS= read -r normal_file; do
    [ -n "$normal_file" ] || continue
    printf '%s\n' --ignore-path "$normal_file"
  done < <(grep -Fvx -f "$content_changed_file" "$all_changed_file" || true)

  rm -f "$content_changed_file" "$all_changed_file"
}

collect_whitespace_ignore_args() {
  whitespace_ignore_args=()
  while IFS= read -r whitespace_ignore_arg; do
    [ -n "$whitespace_ignore_arg" ] || continue
    whitespace_ignore_args+=("$whitespace_ignore_arg")
  done < <(
    whitespace_only_ignore_args "${COVERAGE_BASE:?COVERAGE_BASE is required}" "${COVERAGE_HEAD:?COVERAGE_HEAD is required}"
  )
}

case "$command" in
  html)
    "$coverage_check_bin" html \
      --artifacts "$coverage_artifacts_dir" \
      --output ./coverage-html
    ;;
  pr-check)
    if skip_without_lcov_artifacts "PR patch coverage"; then
      exit 0
    fi
    merge_coverage_artifacts
    collect_whitespace_ignore_args
    "$coverage_check_bin" check \
      --rules .coverage-rules.yml \
      --artifacts "$coverage_artifacts_merged_dir" \
      --suite current-pr \
      --base "$COVERAGE_BASE" \
      --head "$COVERAGE_HEAD" \
      "${whitespace_ignore_args[@]+"${whitespace_ignore_args[@]}"}" \
      --pr "${COVERAGE_PR:?COVERAGE_PR is required}" \
      --repo "${COVERAGE_REPO:?COVERAGE_REPO is required}"
    ;;
  area-check)
    # An area's coverage job runs only after at least one of its suites succeeded, and every suite
    # that succeeds uploads its full LCOV, so an empty artifact directory is a broken upload.
    coverage_area="${COVERAGE_AREA:?COVERAGE_AREA is required}"
    if ! has_lcov_artifacts; then
      echo "::error::No LCOV artifacts found for the ${coverage_area} area coverage gate." >&2
      exit 1
    fi
    merge_coverage_artifacts
    collect_whitespace_ignore_args
    area_rules_file="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/coverage-rules-${coverage_area}.XXXXXX")"
    node ci/coverage-area-rules.mts "$coverage_area" >"$area_rules_file"
    "$coverage_check_bin" check \
      --rules "$area_rules_file" \
      --artifacts "$coverage_artifacts_merged_dir" \
      --suite "$coverage_area" \
      --base "$COVERAGE_BASE" \
      --head "$COVERAGE_HEAD" \
      "${whitespace_ignore_args[@]+"${whitespace_ignore_args[@]}"}"
    ;;
  *)
    echo "Usage: $0 {html|pr-check|area-check}" >&2
    exit 2
    ;;
esac
