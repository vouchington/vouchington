#!/usr/bin/env bash
# Finished-worktree reclaim step of ./dev/cleanup (sourced; expects REPO_ROOT, AUTO_YES, BACKGROUND).

# `vouchington worktree reclaim` removes worktrees whose PR is merged or closed at their HEAD (dry
# run unless --yes). It runs from this checkout, which reclaim always keeps, and under the host-wide
# worktree-resource operation lock so it never removes a worktree while another worktree's
# ./dev/initialize holds that lock. The orphan scans after it reclaim the database and Valkey
# container of any worktree it removed.
cleanup_reclaim_finished_worktrees() {
    local cli="$REPO_ROOT/node_modules/.bin/vouchington" locked=false
    local args=(worktree reclaim)
    echo -e "${BLUE}Reclaiming finished worktrees...${NC}"
    if [ ! -x "$cli" ]; then
        echo -e "${YELLOW}Skipping worktree reclaim: run pnpm install to get vouchington-tooling.${NC}\n"
        return 0
    fi
    if $AUTO_YES; then
        args+=(--yes)
        if worktree_resource_acquire_operation_lock 2>/dev/null; then
            locked=true
            trap worktree_resource_release_operation_lock EXIT
        elif $BACKGROUND; then
            exit 0
        else
            echo -e "${YELLOW}Skipping worktree reclaim: another worktree resource operation is running.${NC}\n"
            return 0
        fi
    fi
    (cd "$REPO_ROOT" && "$cli" "${args[@]}") ||
        echo -e "${YELLOW}Worktree reclaim failed; continuing with orphan cleanup.${NC}"
    if $locked; then
        worktree_resource_release_operation_lock
        trap - EXIT
    fi
    echo ""
}
