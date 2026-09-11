#!/usr/bin/env bash
# Shared guard: refuse to run destructive DB commands on the main worktree.
# Usage: source this file, then call: refuse_on_main "<script-name>" ["<repo-root>"]
#
# Detection: in a sub-worktree <root>/.git is a file (gitdir pointer);
# in the main worktree <root>/.git is a directory. Full clones under
# */.grok/worktrees/*, ${TMPDIR:-${TMP:-${TEMP:-/tmp}}}, or listed in
# ~/.voucha/disposable-checkouts are disposable and are not main.
# This check is cwd-independent, unlike `git rev-parse --git-dir`.

# True when a standalone full clone lives in a disposable agent location.
is_disposable_checkout_path() {
    local toplevel="${1:-}"
    local tmp="${TMPDIR:-${TMP:-${TEMP:-/tmp}}}"
    local normalized_toplevel=""
    local normalized_tmp=""

    [ -n "$toplevel" ] || return 1

    if [ -d "$toplevel" ]; then
        normalized_toplevel=$(cd "$toplevel" && pwd -P) || true
    fi
    if [ -z "$normalized_toplevel" ]; then
        normalized_toplevel="${toplevel%/}"
    fi

    if [ -d "$tmp" ]; then
        normalized_tmp=$(cd "$tmp" && pwd -P) || true
    fi
    if [ -z "$normalized_tmp" ]; then
        normalized_tmp="${tmp%/}"
    fi

    case "$toplevel" in
        */.grok/worktrees | */.grok/worktrees/*) return 0 ;;
    esac
    case "$normalized_toplevel" in
        */.grok/worktrees | */.grok/worktrees/*) return 0 ;;
    esac

    if [[ "$normalized_toplevel" == "$normalized_tmp" ||
        "$normalized_toplevel" == "$normalized_tmp"/* ]]; then
        return 0
    fi

    if [ -f "${HOME}/.voucha/disposable-checkouts" ] &&
        grep -Fxq "$normalized_toplevel" "${HOME}/.voucha/disposable-checkouts"; then
        return 0
    fi

    return 1
}

refuse_on_main() {
    local script_name="${1:-this script}"
    local repo_root="${2:-}"
    local git_toplevel

    if [[ -n "$repo_root" ]]; then
        if ! git -C "$repo_root" rev-parse --show-toplevel >/dev/null 2>&1; then
            echo -e "\033[0;31mError: $script_name cannot inspect repo root '$repo_root'. Refusing to continue.\033[0m" >&2
            exit 1
        fi
        git_toplevel=$(git -C "$repo_root" rev-parse --show-toplevel)
    else
        git_toplevel=$(git rev-parse --show-toplevel 2>/dev/null || true)
    fi

    if [[ -z "$git_toplevel" ]]; then
        return 0
    fi

    if [[ ! -d "$git_toplevel/.git" ]]; then
        return 0
    fi

    if is_disposable_checkout_path "$git_toplevel"; then
        return 0
    fi

    if [[ "${FORCE_MAIN_RESET:-}" == "1" ]]; then
        echo -e "\033[1;33mWARNING: $script_name running on main worktree (FORCE_MAIN_RESET=1)\033[0m" >&2
        return 0
    fi

    echo -e "\033[0;31mError: $script_name refuses to run on the main worktree (would run destructive actions on the main worktree DB).\033[0m" >&2
    echo "Re-run with FORCE_MAIN_RESET=1 if this is intentional." >&2
    exit 1
}
