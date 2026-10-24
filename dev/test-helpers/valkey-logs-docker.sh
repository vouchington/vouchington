#!/usr/bin/env bash
set -euo pipefail
for name in DATABASE_URL S3_AWS_SECRET_ACCESS_KEY BEDROCK_AWS_SECRET_ACCESS_KEY; do
  if [ -n "${!name:-}" ]; then
    printf "%s leaked to docker\n" "$name" >&2
    exit 2
  fi
done
if [ "${1:-}" != exec ] || [ "${2:-}" != voucha-test-valkey ] || [ "${3:-}" != valkey-cli ]; then
  printf "unexpected docker invocation: %s\n" "$*" >&2
  exit 2
fi
case "${4:-}" in
  PING) printf PONG ;;
  MONITOR) printf '+OK monitor started\n'; sleep 1 ;;
  *) printf "unexpected valkey command: %s\n" "${4:-}" >&2; exit 2 ;;
esac
