#!/usr/bin/env bash
# Source this file to use orphan-scan helpers.
#
# Functions:
#   worktree_dir_from_path <path>   — print the short worktree name from a full path
#   scan_orphaned_dbs               — populate ORPHANED_DBS array (requires WORKTREE_PATHS)
#   scan_orphaned_containers        — populate ORPHANED_CONTAINERS array (requires WORKTREE_PATHS)
#
# Callers must populate WORKTREE_PATHS before calling scan_orphaned_dbs /
# scan_orphaned_containers. Include worktree_resource_live_paths so resource owners
# registered by other clones are not treated as orphans.

is_voucha_checkout_path() {
  [ -d "$1" ] && [ -e "$1/.git" ] && [ -f "$1/dev/lib/refuse-on-main.sh" ]
}

worktree_paths_append_unique() {
  local path=$1 existing
  [ -n "$path" ] || return 0
  for existing in "${WORKTREE_PATHS[@]+"${WORKTREE_PATHS[@]}"}"; do
    [ "$existing" = "$path" ] && return 0
  done
  WORKTREE_PATHS+=("$path")
}

worktree_paths_append_command_output() {
  local output path
  output=$("$@") || return 1
  while IFS= read -r path; do
    worktree_paths_append_unique "$path"
  done <<<"$output"
}

is_managed_worktree_db_name() {
  [[ "$1" =~ ^voucha-d[0-9a-f]{12}$ ]]
}

is_managed_worktree_valkey_container() {
  [[ "$1" =~ ^voucha-valkey-d[0-9a-f]{12}$ ]]
}

worktree_resource_live_paths() {
  local root leaf registry path

  if [ -d "${HOME}/.grok/worktrees" ]; then
    for root in "${HOME}/.grok/worktrees"/*; do
      [ -d "$root" ] || continue
      for leaf in "$root"/*; do
        [ -d "$leaf" ] || continue
        if is_voucha_checkout_path "$leaf"; then
          printf '%s\n' "$leaf"
        fi
      done
    done
  fi

  for registry in "${HOME}/.voucha/disposable-checkouts" "${HOME}/.voucha/worktree-resource-owners"; do
    if [ -f "$registry" ]; then
      if ! while IFS= read -r path; do
          [ -n "$path" ] || continue
          if is_voucha_checkout_path "$path"; then
            printf '%s\n' "$path"
          fi
        done <"$registry"; then
        return 1
      fi
    fi
  done
}

if ! declare -F worktree_dir_from_path >/dev/null 2>&1; then
  # shellcheck source=dev/lib/git-worktrees.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/git-worktrees.sh"
fi
if ! declare -F worktree_resource_owned_db_name >/dev/null 2>&1; then
  # shellcheck source=dev/lib/worktree-resource-env.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/worktree-resource-env.sh"
fi

scan_orphaned_dbs() {
  local db env_worktree_dir FOUND owned_db worktree worktree_dir
  ORPHANED_DBS=()
  while IFS= read -r db; do
    db=$(echo "$db" | xargs)
    [ -z "$db" ] && continue
    [[ "$db" == "voucha" || "$db" == "filaments" ]] && continue
    is_managed_worktree_db_name "$db" || continue

    FOUND=false
    for worktree in "${WORKTREE_PATHS[@]+"${WORKTREE_PATHS[@]}"}"; do
      if [ -f "$worktree/.env" ]; then
        if (
          DATABASE_URL="$(env_database_url_from_file "$worktree/.env")"
          [ -n "${DATABASE_URL:-}" ] && [ "$(db_name_from_url)" = "$db" ]
        ); then
          FOUND=true
          break
        fi
      fi
      owned_db=$(worktree_resource_owned_db_name "$worktree") || return 1
      if [ "$owned_db" = "$db" ]; then
        worktree_dir=$(worktree_resource_current_dir "$worktree") || return 1
        env_worktree_dir=$(env_value_from_file "$worktree/.env" WORKTREE_DIR)
        if [ "$env_worktree_dir" != "$worktree_dir" ]; then
          FOUND=true
          break
        fi
      fi
    done

    if ! $FOUND; then
      ORPHANED_DBS+=("$db")
    fi
  done < <(psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -E 'voucha-|vouchit-|filaments-' || true)
}

scan_orphaned_containers() {
  local container env_worktree_dir FOUND owned_container worktree worktree_dir
  ORPHANED_CONTAINERS=()
  while IFS= read -r container; do
    [ -z "$container" ] && continue
    [[ "$container" == "voucha-valkey" || "$container" == "filaments-valkey" ]] && continue
    is_managed_worktree_valkey_container "$container" || continue

    FOUND=false
    for worktree in "${WORKTREE_PATHS[@]+"${WORKTREE_PATHS[@]}"}"; do
      if [ -f "$worktree/.env" ]; then
        if grep -qF "VALKEY_CONTAINER=$container" "$worktree/.env" 2>/dev/null; then
          FOUND=true
          break
        fi
      fi
      owned_container=$(worktree_resource_owned_valkey_container "$worktree") || return 1
      if [ "$owned_container" = "$container" ]; then
        worktree_dir=$(worktree_resource_current_dir "$worktree") || return 1
        env_worktree_dir=$(env_value_from_file "$worktree/.env" WORKTREE_DIR)
        if [ "$env_worktree_dir" != "$worktree_dir" ]; then
          FOUND=true
          break
        fi
      fi
    done

    if ! $FOUND; then
      ORPHANED_CONTAINERS+=("$container")
    fi
  done < <({
    docker ps -a --filter "name=voucha-valkey-" --format '{{.Names}}' 2>/dev/null || true
    docker ps -a --filter "name=vouchit-valkey-" --format '{{.Names}}' 2>/dev/null || true
    docker ps -a --filter "name=filaments-valkey-" --format '{{.Names}}' 2>/dev/null || true
  })
}
