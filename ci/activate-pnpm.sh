#!/usr/bin/env bash

set -euo pipefail

required_node="$(tr -d '[:space:]' < "$GITHUB_WORKSPACE/.nvmrc")"
case "$(node --version 2>/dev/null)" in
  v"${required_node}".*) ;;
  *)
    case "$(uname -m)" in
      aarch64 | arm64) arch=arm64 ;;
      x86_64) arch=x64 ;;
      *)
        echo "::error::manual Node ${required_node} fallback: unsupported arch $(uname -m)"
        exit 1
        ;;
    esac
    case "$(uname -s)" in
      Linux)
        os=linux
        tarext=tar.xz
        ;;
      Darwin)
        os=darwin
        tarext=tar.gz
        ;;
      *)
        echo "::error::manual Node ${required_node} fallback: unsupported OS $(uname -s)"
        exit 1
        ;;
    esac
    # GITHUB_WORKSPACE is the checked-out repository root. This path runs before
    # node_modules exists, so it cannot use the published download helper.
    # shellcheck disable=SC1091
    source "$GITHUB_WORKSPACE/ci/curl-to.sh"
    if [ -n "${RUNNER_TEMP:-}" ]; then
      dest="${RUNNER_TEMP}/manual-node-${required_node}"
    else
      # RUNNER_TEMP is guaranteed in GitHub Actions. A fresh local fallback avoids
      # sharing a predictable download path with another process.
      dest="$(mktemp -d)/manual-node-${required_node}"
    fi
    mkdir -p "$dest"
    shasums="${dest}/SHASUMS256.txt"
    ci_download_to "https://nodejs.org/dist/latest-v${required_node}.x/SHASUMS256.txt" "$shasums" --retry 3 --max-time 30
    tar_pattern="node-v${required_node}"'\.[0-9]+\.[0-9]+'"-${os}-${arch}"'\.'"${tarext}"'$'
    tarname="$(grep -E "$tar_pattern" "$shasums" | head -n 1 | awk '{print $2}' || true)"
    if [ -z "$tarname" ]; then
      echo "::error::manual Node ${required_node} fallback: no ${os}-${arch} tarball in SHASUMS256.txt"
      exit 1
    fi
    ver="${tarname#node-v}"
    suffix="-${os}-${arch}.${tarext}"
    ver="${ver%"$suffix"}"
    extracted="${dest}/node-v${ver}-${os}-${arch}"
    ci_download_to "https://nodejs.org/dist/v${ver}/${tarname}" "${dest}/${tarname}" --retry 3 --max-time 120
    if command -v sha256sum >/dev/null 2>&1; then
      (cd "$dest" && grep " ${tarname}$" SHASUMS256.txt | sha256sum -c -)
    else
      (cd "$dest" && grep " ${tarname}$" SHASUMS256.txt | shasum -a 256 -c -)
    fi
    tar -xf "${dest}/${tarname}" -C "$dest"
    tc_bin="${extracted}/bin"
    echo "::warning::manual Node ${required_node} download triggered; setup-node PATH prepend missing (used ${tc_bin})"
    echo "$tc_bin" >> "$GITHUB_PATH"
    export PATH="$tc_bin:$PATH"
    ;;
esac

echo "node: $(which node) $(node --version)"
case "$(node --version)" in
  v26.*) ;;
  *)
    echo "::error::Node 26 is required but $(node --version) is active; check the actions/setup-node step"
    exit 1
    ;;
esac

pm="$(node -p "require('./package.json').packageManager")"
pnpm_version="${pm#pnpm@}"
pnpm_prefix="${RUNNER_TEMP:-$HOME/.local}/pnpm"
pnpm_bin="${pnpm_prefix}/bin"
mkdir -p "$pnpm_bin"
node_bin="$(dirname "$(which node)")"
if [ -x "${node_bin}/corepack" ]; then
  "${node_bin}/corepack" enable --install-directory "$pnpm_bin"
  "${node_bin}/corepack" prepare "pnpm@${pnpm_version}" --activate
else
  # Isolate the bootstrap install from repository and runner npm configuration.
  (cd "${RUNNER_TEMP:-/tmp}" && npm_config_userconfig=/dev/null npm install --global --prefix "$pnpm_prefix" "pnpm@${pnpm_version}")
fi
echo "$pnpm_bin" >> "$GITHUB_PATH"
export PATH="$pnpm_bin:$PATH"
pnpm --version
