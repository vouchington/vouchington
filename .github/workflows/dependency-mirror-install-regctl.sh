#!/usr/bin/env bash
set -euo pipefail
curl --fail --silent --show-error --location --connect-timeout 10 --max-time 90 \
  https://github.com/regclient/regclient/releases/download/v0.11.7/regctl-linux-amd64 \
  --output "$REGCTL_PATH"
printf '%s  %s\n' \
  '3737fbbdd791e04e7a831640b681f3397a376498e80e2ad9b1b2d27296f239bc' \
  "$REGCTL_PATH" | sha256sum --check
chmod 755 "$REGCTL_PATH"
