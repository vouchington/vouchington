#!/usr/bin/env bash
# Source this file to use flush_valkey.
# Reads VALKEY_CONTAINER, VALKEY_WORKER_QUEUE_URL, VALKEY_URL from the environment.

flush_valkey() {
  local GREEN='\033[0;32m'
  local YELLOW='\033[1;33m'
  local NC='\033[0m'

  if [ -n "${VALKEY_CONTAINER:-}" ]; then
    if docker exec "$VALKEY_CONTAINER" valkey-cli FLUSHALL >/dev/null 2>&1; then
      echo -e "${GREEN}✓ Valkey flushed${NC}"
    else
      echo -e "${YELLOW}  Container not running — skipped${NC}"
    fi
  elif [ -n "${VALKEY_WORKER_QUEUE_URL:-${VALKEY_URL:-}}" ]; then
    if redis-cli -u "${VALKEY_WORKER_QUEUE_URL:-$VALKEY_URL}" FLUSHALL >/dev/null 2>&1; then
      echo -e "${GREEN}✓ Valkey flushed${NC}"
    else
      echo -e "${YELLOW}  redis-cli not found or failed to flush Valkey — skipped${NC}"
    fi
  else
    echo -e "${YELLOW}  Valkey not configured (VALKEY_CONTAINER/VALKEY_URL not set) — skipped${NC}"
  fi
}
