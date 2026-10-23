#!/usr/bin/env bash
# Product hooks for the published worktree reset. Run from the worktree root:
#   bash dev/lib/reset-worktree-hooks.sh pre|post
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Tear down services, DB, and Valkey container only when this worktree owns
# them. The backend-level check is deliberately used here, not the stricter
# web check: teardown removes DB + Valkey resources, which a backend-only
# worktree owns just as much as a web-initialized one. Gating on the web
# validator would skip teardown (and leak a Postgres DB + Docker container)
# for every backend-only worktree.
reset_pre() {
    # shellcheck source=worktree-resource-env.sh
    source "$REPO_ROOT/dev/lib/worktree-resource-env.sh"
    if worktree_resource_validate_backend_init "$REPO_ROOT"; then
        echo -e "${YELLOW}Tearing down services, DB, and Valkey container...${NC}"
        "$REPO_ROOT/dev/teardown" --yes
        echo ""
    elif [ "${WORKTREE_RESOURCE_STATUS:-}" = "missing-valkey-port" ]; then
        echo -e "${YELLOW}Valkey port tracking file (.valkey-port) missing — services already torn down; skipping${NC}\n"
    elif [ "${WORKTREE_RESOURCE_STATUS:-}" = "missing-env" ]; then
        echo -e "${YELLOW}Worktree was never initialized — skipping teardown${NC}\n"
    else
        echo -e "${YELLOW}Worktree resources are not initialized for this worktree; skipping teardown${NC}"
        echo -e "${YELLOW}Run ./dev/initialize backend (or web) to create worktree-owned DB and Valkey resources.${NC}\n"
    fi
}

reset_post() {
    echo -e "${GREEN}✓ Removed generated output${NC}\n"
    rm -f "$REPO_ROOT/.initialized"

    echo -e "${YELLOW}Initializing monorepo tools...${NC}"
    "$REPO_ROOT/dev/initialize" monorepo
    echo ""

    # Clear tmux pane/window so the prior task label doesn't persist
    if ! "$REPO_ROOT/dev/tmux-name" ""; then
        echo "Warning: tmux title cleanup was skipped because the pane binding could not be verified." >&2
    fi
}

case "${1:-}" in
    pre) reset_pre ;;
    post) reset_post ;;
    *) echo "Usage: reset-worktree-hooks.sh pre|post" >&2; exit 2 ;;
esac
