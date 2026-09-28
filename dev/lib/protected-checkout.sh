#!/usr/bin/env bash
# Shared by ./dev/rebase-onto-main and ./dev/reset-worktree.
# Returns 0 when git may update the worktree. Returns 1 when a sandboxed
# checkout would replace a protected path, or when git cannot answer.
# The path list is dev/protected-checkout-paths.txt.

protected_checkout_refuse_message() {
  cat <<'EOF' >&2
Refusing to update the worktree because a protected path would be replaced.
A sandboxed checkout can stop halfway and leave the tree half-updated.
Run ./dev/rebase-onto-main with SANDBOX_RUNTIME and CURSOR_SANDBOX unset.
Do not use ours/theirs strategy options. git rebase --abort stays allowed.
EOF
}

# protected_checkout_allow <repo> <target>
protected_checkout_allow() {
  local repo="$1"
  local target="$2"
  local paths_file="$repo/dev/protected-checkout-paths.txt"
  local diff_names=""
  local pathspec
  local pathspecs=()

  # git diff in this repo's git does not accept --pathspec-from-file. Pass the
  # shared pathspec list as arguments. Bash 3.2 rejects an empty "${arr[@]}" under set -u.
  while IFS= read -r pathspec || [ -n "$pathspec" ]; do
    if [ -n "$pathspec" ]; then
      pathspecs+=("$pathspec")
    fi
  done < "$paths_file"

  if ! diff_names="$(git -C "$repo" diff --name-only --diff-filter=ACDMRTUXB "$target" -- "${pathspecs[@]+"${pathspecs[@]}"}")"; then
    protected_checkout_refuse_message
    return 1
  fi
  if [ -z "$diff_names" ]; then
    return 0
  fi
  if [ -n "${SANDBOX_RUNTIME:-}" ] || [ -n "${CURSOR_SANDBOX:-}" ]; then
    protected_checkout_refuse_message
    printf '%s\n' "$diff_names" >&2
    return 1
  fi
  return 0
}
