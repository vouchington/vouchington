#!/usr/bin/env bash
# regctl stand-in for the dependency-mirror Vitest cases.
#
# The publish path invokes regctl once per digest and copy. A Node stand-in spends
# about three seconds of the five-second test budget on interpreter startup for the
# two-image case, and a busy tooling job pushes that over the deadline. This script
# records the same argv and answers the same digest, copy, and exit contract.
set -euo pipefail

if [[ -z "${CALLS:-}" || -z "${STATE:-}" ]]; then
  echo 'regctl double expected CALLS and STATE' >&2
  exit 19
fi

{
  printf '['
  separator=''
  for arg in "$@"; do
    escaped=${arg//\\/\\\\}
    escaped=${escaped//\"/\\\"}
    printf '%s"%s"' "$separator" "$escaped"
    separator=','
  done
  printf ']\n'
} >>"$CALLS"

normalize_state() {
  if [[ ! -e "$STATE" ]]; then
    : >"$STATE"
    return 0
  fi
  if [[ ! -s "$STATE" ]]; then
    return 0
  fi
  local signature
  IFS= read -r -n 1 signature <"$STATE" || true
  if [[ "$signature" != '{' ]]; then
    return 0
  fi
  local converted
  converted=$(mktemp "${TMPDIR:-/tmp}/regctl-double.XXXXXX")
  jq -r 'to_entries[] | [.key, .value] | @tsv' "$STATE" >"$converted"
  mv "$converted" "$STATE"
}

lookup_exact() {
  local ref=$1 key value
  while IFS=$'\t' read -r key value || [[ -n "${key:-}" ]]; do
    if [[ "$key" == "$ref" ]]; then
      printf '%s\n' "$value"
      return 0
    fi
    key=''
  done <"$STATE"
  return 1
}

upsert() {
  local key=$1 value=$2 updated key_line value_line found=0
  updated=$(mktemp "${TMPDIR:-/tmp}/regctl-double.XXXXXX")
  while IFS=$'\t' read -r key_line value_line || [[ -n "${key_line:-}" ]]; do
    if [[ "$key_line" == "$key" ]]; then
      printf '%s\t%s\n' "$key" "$value"
      found=1
    else
      printf '%s\t%s\n' "$key_line" "$value_line"
    fi
    key_line=''
  done <"$STATE" >"$updated"
  if [[ "$found" -eq 0 ]]; then
    printf '%s\t%s\n' "$key" "$value" >>"$updated"
  fi
  mv "$updated" "$STATE"
}

normalize_state

if [[ "${1:-}" == registry && "${2:-}" == login ]]; then
  exit 0
fi

if [[ "${1:-}" == image && "${2:-}" == digest ]]; then
  ref=${3:?}
  if [[ "$ref" == *ghcr.io/* && "${AUTH_LOOKUP_FAILURE:-0}" == 1 ]]; then
    echo 'unauthorized [http 401]' >&2
    exit 1
  fi
  if [[ "$ref" == docker.io/* || "$ref" == gcr.io/* ]]; then
    if [[ "$ref" == *example/one* ]]; then
      printf '%s\n' "${EXPECTED_FIRST:?}"
    else
      printf '%s\n' "${EXPECTED_SECOND:?}"
    fi
    exit 0
  fi
  if [[ "$ref" == *:sha-* && "${POISONED_APPROVED:-0}" == 1 ]]; then
    printf '%s\n' 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    exit 0
  fi
  if value=$(lookup_exact "$ref"); then
    printf '%s\n' "$value"
    exit 0
  fi
  if [[ "$ref" == *@sha256:* ]]; then
    base=${ref%%@*}
    digest=${ref#*@}
    prefix="${base}:"
    while IFS=$'\t' read -r key value || [[ -n "${key:-}" ]]; do
      if [[ "$key" == "$prefix"* && "$value" == "$digest" ]]; then
        printf '%s\n' "$digest"
        exit 0
      fi
      key=''
    done <"$STATE"
  fi
  echo "failed to request manifest head ${ref}: request failed: not found [http 404]:" >&2
  exit 1
fi

if [[ "${1:-}" == image && "${2:-}" == copy ]]; then
  args=("$@")
  count=${#args[@]}
  src=${args[$((count - 2))]}
  dst=${args[$((count - 1))]}
  if [[ "$dst" == ocidir://* && "$dst" == *"entry-${FAIL_STAGE:-0}"* ]]; then
    exit 17
  fi
  if [[ "$dst" == ocidir://* && "$dst" == */verify-* && "${FAIL_ROUNDTRIP:-0}" == 1 ]]; then
    exit 21
  fi
  if value=$(lookup_exact "$src"); then
    digest=$value
  elif [[ "$src" == *@sha256:* ]]; then
    digest=${src#*@}
  else
    digest=''
  fi
  if [[ -z "$digest" ]]; then
    exit 18
  fi
  upsert "$dst" "$digest"
  exit 0
fi

exit 19
