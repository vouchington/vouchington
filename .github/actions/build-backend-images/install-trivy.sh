#!/usr/bin/env bash
# Installs the TRIVY_VERSION release of Trivy after verifying its published checksum.
set -euo pipefail
if trivy --version 2>/dev/null | grep -q "$TRIVY_VERSION"; then
  echo "trivy $TRIVY_VERSION already installed"
  exit 0
fi
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) os="macOS"; arch="ARM64" ;;
  Darwin-x86_64) os="macOS"; arch="64bit" ;;
  Linux-aarch64|Linux-arm64) os="Linux"; arch="ARM64" ;;
  Linux-x86_64) os="Linux"; arch="64bit" ;;
  *) echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
mkdir -p "$HOME/.local/bin"
BASE_URL="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}"
ARCHIVE="trivy_${TRIVY_VERSION}_${os}-${arch}.tar.gz"
TRIVY_ARCHIVE="${RUNNER_TEMP:-/tmp}/${ARCHIVE}"
source "$GITHUB_WORKSPACE/ci/curl-to.sh"
ci_download_to "${BASE_URL}/${ARCHIVE}" "$TRIVY_ARCHIVE" --retry 3 --retry-all-errors
CHECKSUMS="${RUNNER_TEMP:-/tmp}/trivy_${TRIVY_VERSION}_checksums.txt"
ci_download_to "${BASE_URL}/trivy_${TRIVY_VERSION}_checksums.txt" "$CHECKSUMS" --retry 3 --retry-all-errors
EXPECTED=$(grep "${ARCHIVE}" "$CHECKSUMS" | awk '{print $1}')
if command -v sha256sum >/dev/null 2>&1; then
  echo "${EXPECTED}  $TRIVY_ARCHIVE" | sha256sum -c -
else
  echo "${EXPECTED}  $TRIVY_ARCHIVE" | shasum -a 256 -c -
fi
tar -xzf "$TRIVY_ARCHIVE" -C "${RUNNER_TEMP:-/tmp}" trivy
mv "${RUNNER_TEMP:-/tmp}/trivy" "$HOME/.local/bin/trivy"
chmod +x "$HOME/.local/bin/trivy"
echo "$HOME/.local/bin" >> "$GITHUB_PATH"
rm -f "$TRIVY_ARCHIVE" "$CHECKSUMS"
