#!/usr/bin/env bash
# Helpers for loading and validating worktree-owned local resources.

if ! declare -F db_name_from_url >/dev/null 2>&1; then
  # shellcheck source=dev/lib/db-name-from-url.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/db-name-from-url.sh"
fi

worktree_resource_dir_from_path() {
  local path=$1
  local digest
  local digest_output
  local physical_path
  local worktree_dir

  physical_path=$(cd "$path" && pwd -P) || return 1

  # Non-repository fixture roots retain a readable basename; every real non-main checkout hashes.
  if [ ! -e "$physical_path/.git" ] || worktree_resource_is_main "$physical_path"; then
    worktree_dir=$(basename "$physical_path")
  else
    if ! digest_output=$(printf '%s' "$physical_path" | openssl dgst -sha256); then
      echo "Error: failed to generate the worktree resource identity SHA-256 digest." >&2
      return 1
    fi
    digest=${digest_output##* }
    if [[ ! "$digest" =~ ^[0-9a-f]{64}$ ]]; then
      echo "Error: worktree resource identity SHA-256 output was malformed." >&2
      return 1
    fi
    worktree_dir="d${digest:0:12}"
  fi

  printf '%s' "$worktree_dir"
}

worktree_resource_identity_record() {
  local path=$1
  local kind=non-main
  local worktree_dir

  if worktree_resource_is_main "$path"; then
    kind=main
  fi

  worktree_dir=$(worktree_resource_dir_from_path "$path") || return 1
  printf '%s\n%s' "$kind" "$worktree_dir"
}

sanitize_worktree_dir() {
  local sanitized
  sanitized=$(printf '%s' "$1" | tr '/' '-' | tr -cd 'a-zA-Z0-9_-')
  printf '%s' "${sanitized:-worktree}"
}

worktree_resource_owned_db_name() {
  local current_dir
  local sanitized
  worktree_resource_is_main "$1" && { printf '%s' voucha; return; }
  current_dir=$(worktree_resource_current_dir "$1") || return 1
  sanitized=$(sanitize_worktree_dir "$current_dir")
  printf '%s' "voucha-${sanitized:0:53}"
}

worktree_resource_owned_valkey_container() {
  local current_dir
  local sanitized
  worktree_resource_is_main "$1" && { printf '%s' voucha-valkey; return; }
  current_dir=$(worktree_resource_current_dir "$1") || return 1
  sanitized=$(sanitize_worktree_dir "$current_dir")
  printf '%s' "voucha-valkey-${sanitized:0:45}"
}

worktree_resource_current_dir() {
  worktree_resource_dir_from_path "$1"
}

worktree_resource_acquire_operation_lock() {
  local lock_root="${HOME}/.voucha/worktree-resource-operations"
  local lock_path="$lock_root/lock"
  local token="owner.$$.$RANDOM$RANDOM"
  local owner_path="$lock_root/$token"
  local held_owner_path held_pid held_token

  mkdir -p "$lock_root"
  printf '%s\n' "$$" >"$owner_path"

  if ln -s "$token" "$lock_path" 2>/dev/null; then
    if [ "$(readlink "$lock_path" 2>/dev/null || true)" = "$token" ]; then
      WORKTREE_RESOURCE_OPERATION_LOCK_TOKEN=$token
      return 0
    fi
    held_token=$(readlink "$lock_path" 2>/dev/null || true)
    if [[ "$held_token" =~ ^owner\.[0-9]+\.[0-9]+$ ]] \
      && [ -L "$lock_root/$held_token/$token" ] \
      && [ "$(readlink "$lock_root/$held_token/$token")" = "$token" ]; then
      rm -f "$lock_root/$held_token/$token"
    fi
  fi
  if [ ! -L "$lock_path" ]; then
    rm -f "$owner_path"
    echo "Error: worktree resource operation lock is not a symbolic link: $lock_path" >&2
    return 1
  fi
  held_token=$(readlink "$lock_path")
  if [[ ! "$held_token" =~ ^owner\.[0-9]+\.[0-9]+$ ]]; then
    rm -f "$owner_path"
    echo "Error: worktree resource operation lock has an invalid owner: $lock_path" >&2
    return 1
  fi
  held_owner_path="$lock_root/$held_token"
  held_pid=$(cat "$held_owner_path" 2>/dev/null || true)
  rm -f "$owner_path"
  if [[ "$held_pid" =~ ^[0-9]+$ ]] && kill -0 "$held_pid" 2>/dev/null; then
    echo "Error: another worktree resource operation is running (PID $held_pid)." >&2
  else
    echo "Error: the worktree resource operation lock is stale; run ./dev/unstick-locks when no resource operation is running." >&2
  fi
  return 1
}

worktree_resource_clear_stale_operation_lock() {
  local lock_root="${HOME}/.voucha/worktree-resource-operations"
  local lock_path="$lock_root/lock"
  local held_owner_path held_pid held_token
  export WORKTREE_RESOURCE_LOCK_CLEANUP_STATUS=missing
  [ -L "$lock_path" ] || return 0
  held_token=$(readlink "$lock_path")
  [[ "$held_token" =~ ^owner\.[0-9]+\.[0-9]+$ ]] || {
    export WORKTREE_RESOURCE_LOCK_CLEANUP_STATUS=invalid
    return 1
  }
  held_owner_path="$lock_root/$held_token"
  held_pid=$(cat "$held_owner_path" 2>/dev/null || true)
  if [[ "$held_pid" =~ ^[0-9]+$ ]] && kill -0 "$held_pid" 2>/dev/null; then
    export WORKTREE_RESOURCE_LOCK_CLEANUP_STATUS=active
    return 1
  fi
  [ "$(readlink "$lock_path" 2>/dev/null || true)" = "$held_token" ] || return 1
  rm -f "$lock_path"
  rm -f "$held_owner_path"
  export WORKTREE_RESOURCE_LOCK_CLEANUP_STATUS=removed
}

worktree_resource_release_operation_lock() {
  local token=${WORKTREE_RESOURCE_OPERATION_LOCK_TOKEN:-}
  local lock_root="${HOME}/.voucha/worktree-resource-operations"
  local lock_path="$lock_root/lock"
  [ -n "$token" ] || return 0
  if [ "$(readlink "$lock_path" 2>/dev/null || true)" = "$token" ]; then
    rm -f "$lock_path"
  fi
  rm -f "$lock_root/$token"
  unset WORKTREE_RESOURCE_OPERATION_LOCK_TOKEN
}

# is_disposable_checkout_path lives in refuse-on-main.sh.
if ! declare -F is_disposable_checkout_path >/dev/null 2>&1; then
  # shellcheck source=dev/lib/refuse-on-main.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/refuse-on-main.sh"
fi

worktree_resource_is_main() {
  local repo_root=$1
  [ -d "$repo_root/.git" ] || return 1
  if is_disposable_checkout_path "$repo_root"; then
    return 1
  fi
  return 0
}

register_worktree_resource_path() {
  local path=$1
  local physical_path
  local registry_dir="${HOME}/.voucha"
  local registry="$registry_dir/worktree-resource-owners"

  [ -n "$path" ] || return 0
  physical_path=$(cd "$path" && pwd -P) || return 1
  worktree_resource_is_main "$physical_path" && return 0
  mkdir -p "$registry_dir"
  if [ -f "$registry" ] && grep -Fxq "$physical_path" "$registry"; then
    return 0
  fi
  printf '%s\n' "$physical_path" >>"$registry"
}

register_disposable_checkout_path() {
  local path=$1
  local physical_path
  local registry_dir="${HOME}/.voucha"
  local registry="$registry_dir/disposable-checkouts"

  [ -n "$path" ] || return 0
  physical_path=$(cd "$path" && pwd -P) || return 1
  mkdir -p "$registry_dir"
  if [ -f "$registry" ] && grep -Fxq "$physical_path" "$registry"; then
    return 0
  fi
  printf '%s\n' "$physical_path" >>"$registry"
}

refuse_shared_resources_on_disposable() {
  local script_name=$1
  local repo_root=$2
  local db_name=$3
  local valkey_container=${4:-}
  local current_dir

  if worktree_resource_is_main "$repo_root"; then
    return 0
  fi
  current_dir=$(worktree_resource_current_dir "$repo_root")
  if [ -z "${WORKTREE_DIR:-}" ] || [ "$WORKTREE_DIR" != "$current_dir" ]; then
    echo "Error: $script_name refuses to operate on another checkout's resources from a disposable clone." >&2
    exit 1
  fi
  if [ "$db_name" = "voucha" ] || [ "$valkey_container" = "voucha-valkey" ]; then
    echo "Error: $script_name refuses to operate on shared main resources from a disposable checkout." >&2
    echo "This checkout is disposable but DATABASE_URL or VALKEY_CONTAINER still names the shared voucha resources." >&2
    echo "Run ./dev/initialize web to assign worktree-owned resources." >&2
    exit 1
  fi
}

worktree_resource_clear_env() {
  unset PORT NEXT_PORT WEB_PORT WORKER_PORT IMAGE_LAMBDA_PORT INSPECTOR_PORT STORYBOOK_PORT
  unset VALKEY_URL VALKEY_SESSION_URL VALKEY_CACHE_URL VALKEY_RATE_LIMITER_URL
  unset VALKEY_DYNAMIC_CONFIG_URL VALKEY_WORKER_QUEUE_URL VALKEY_CONTAINER
  unset DATABASE_URL WORKTREE_DIR
}

worktree_resource_source_env() {
  local repo_root=$1

  worktree_resource_clear_env
  [ -f "$repo_root/.env" ] || return 1

  set -a
  # shellcheck source=/dev/null
  source "$repo_root/.env" || {
    set +a
    worktree_resource_clear_env
    return 1
  }
  set +a
}

worktree_resource_load_current_env() {
  local repo_root=$1
  local current_worktree_dir

  if ! worktree_resource_source_env "$repo_root"; then
    return 1
  fi

  current_worktree_dir=$(worktree_resource_current_dir "$repo_root")
  if ! worktree_resource_is_main "$repo_root"; then
    if [ -z "${WORKTREE_DIR:-}" ] || [ "${WORKTREE_DIR:-}" != "$current_worktree_dir" ]; then
      worktree_resource_clear_env
      return 1
    fi
  fi
}

# Validates that this worktree owns real, non-stale backend-level resources:
# a sourceable .env with a WORKTREE_DIR matching this checkout, a resolvable
# DATABASE_URL and VALKEY_CONTAINER, and (off main) resource names that are
# not the shared main-worktree names. This is the base rung every stronger
# capability (web) builds on — it does not require any CF Worker or Next.js
# artifacts to exist.
worktree_resource_validate_backend_init() {
  local repo_root=$1
  local current_worktree_dir db_name

  export WORKTREE_RESOURCE_STATUS=ok

  if [ ! -f "$repo_root/.env" ]; then
    export WORKTREE_RESOURCE_STATUS=missing-env
    return 1
  fi

  if [ ! -f "$repo_root/.valkey-port" ]; then
    export WORKTREE_RESOURCE_STATUS=missing-valkey-port
    return 1
  fi

  if ! worktree_resource_source_env "$repo_root"; then
    export WORKTREE_RESOURCE_STATUS=bad-env
    return 1
  fi

  current_worktree_dir=$(worktree_resource_current_dir "$repo_root")
  if [ -z "${WORKTREE_DIR:-}" ]; then
    export WORKTREE_RESOURCE_STATUS=missing-worktree-dir
    return 1
  fi
  if [ "$WORKTREE_DIR" != "$current_worktree_dir" ]; then
    export WORKTREE_RESOURCE_STATUS=stale-env
    return 1
  fi

  if [ -z "${DATABASE_URL:-}" ]; then
    export WORKTREE_RESOURCE_STATUS=missing-database-url
    return 1
  fi
  db_name=$(DATABASE_URL="$DATABASE_URL" db_name_from_url)
  if [ -z "$db_name" ]; then
    export WORKTREE_RESOURCE_STATUS=missing-database-name
    return 1
  fi

  if [ -z "${VALKEY_CONTAINER:-}" ]; then
    export WORKTREE_RESOURCE_STATUS=missing-valkey-container
    return 1
  fi

  if ! worktree_resource_is_main "$repo_root"; then
    if [ "$db_name" = "voucha" ] || [ "$VALKEY_CONTAINER" = "voucha-valkey" ]; then
      export WORKTREE_RESOURCE_STATUS=main-resource
      return 1
    fi
  fi
}

# Checks that the ports embedded in cloudflare-worker/.dev.vars and
# web/.env.local still match the ports currently sourced from .env. Only
# unconditional lines are compared (no export prefix, no mkcert-dependent
# value) so this can't false-demote on cert state. Must be called after
# worktree_resource_source_env has populated PORT/NEXT_PORT/WORKER_PORT/
# IMAGE_LAMBDA_PORT in the current shell. Callers run under `set -u`
# (dev/initialize:2) even from inside a `$( )` command substitution, so an
# otherwise backend-valid .env that is simply missing one of these four port
# lines must not abort the shell via an unbound-variable expansion — it must
# fail this check like any other mismatch. Guard every expansion with `:-`
# so a missing value produces a fixed string no real `.dev.vars`/`.env.local`
# line can match, rather than a fatal abort.
worktree_resource_web_ports_consistent() {
  local repo_root=$1

  grep -qxF "BACKEND_ORIGIN=http://localhost:${PORT:-}" "$repo_root/cloudflare-worker/.dev.vars" \
    && grep -qxF "WEB_ORIGIN=http://localhost:${NEXT_PORT:-}" "$repo_root/cloudflare-worker/.dev.vars" \
    && grep -qxF "SITEMAP_BASE_URL=http://localhost:${WORKER_PORT:-}" "$repo_root/web/.env.local" \
    && grep -qxF "IMAGE_ORIGIN=http://localhost:${IMAGE_LAMBDA_PORT:-}" "$repo_root/web/.env.local"
}

# Validates web capability: everything worktree_resource_validate_backend_init
# checks, plus that the CF Worker and Next.js artifact files exist and their
# embedded ports have not drifted from .env. Do not clobber
# WORKTREE_RESOURCE_STATUS after a backend-level failure — callers dispatch on
# statuses like missing-valkey-port/missing-env that only the backend check
# produces.
worktree_resource_validate_web_init() {
  local repo_root=$1

  if ! worktree_resource_validate_backend_init "$repo_root"; then
    return 1
  fi

  if [ ! -f "$repo_root/cloudflare-worker/.dev.vars" ]; then
    export WORKTREE_RESOURCE_STATUS=missing-worker-env
    return 1
  fi

  if [ ! -f "$repo_root/web/.env.local" ]; then
    export WORKTREE_RESOURCE_STATUS=missing-web-env-local
    return 1
  fi

  if ! worktree_resource_web_ports_consistent "$repo_root"; then
    export WORKTREE_RESOURCE_STATUS=stale-web-ports
    return 1
  fi
}
