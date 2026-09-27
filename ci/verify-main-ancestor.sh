#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
: "${SOURCE_SHA:?SOURCE_SHA is required}"

if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo '::error::The image source revision must be an exact lowercase commit SHA.' >&2
  exit 1
fi

if [ "$(git rev-parse --is-shallow-repository)" != false ]; then
  echo '::error::Image reuse requires complete Git history.' >&2
  exit 1
fi

checked_out_head=$(git rev-parse --verify 'HEAD^{commit}')
if [ "$checked_out_head" != "$SOURCE_SHA" ]; then
  echo '::error::The image source revision does not match the checked-out commit.' >&2
  exit 1
fi

main_tip=$(git rev-parse --verify 'refs/remotes/origin/main^{commit}')
if ! git merge-base --is-ancestor "$SOURCE_SHA" "$main_tip"; then
  echo '::error::The image source revision is not reachable from pinned origin/main.' >&2
  exit 1
fi

{
  printf 'source_sha=%s\n' "$SOURCE_SHA"
  printf 'main_tip=%s\n' "$main_tip"
} >> "$GITHUB_OUTPUT"
