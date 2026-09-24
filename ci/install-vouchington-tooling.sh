#!/usr/bin/env bash
# Install the lockfile-pinned vouchington-tooling package into dest so isolated
# GitHub Actions can import it without a full
# workspace install. Download the tarball from registry.npmjs.org, verify it
# against pnpm-lock.yaml, then npm-install the verified file with a clean
# userconfig so a prior PR-controlled $HOME/.npmrc cannot redirect the registry.
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo "usage: $0 <dest-dir> <package-json>" >&2
  exit 2
fi
dest="$1"
pkg_json="$2"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$(dirname "$pkg_json")" && pwd)"

fail() {
  echo "$0: $1" >&2
  exit 1
}

spec="$(
  node --input-type=module -e '
    import { readFileSync } from "node:fs"
    const pkg = JSON.parse(readFileSync(process.argv[1], "utf8"))
    const spec = pkg.devDependencies?.["vouchington-tooling"] ?? pkg.dependencies?.["vouchington-tooling"]
    if (!spec) throw new Error("vouchington-tooling is not listed")
    process.stdout.write(String(spec))
  ' "$pkg_json"
)"
case "$spec" in
  '' | *[!A-Za-z0-9.^_-]*) fail 'vouchington-tooling is not listed in package.json' ;;
esac

read_locked_field() {
  awk -v field="$1" '
    # pnpm 12 prepends a lockfile document with its own root importer; skip past it.
    $0 == "  .:" { in_root = 1; next }
    in_root && /^  [^ ]/ { in_root = 0 }
    in_root && $0 == "      vouchington-tooling:" { in_dependency = 1; next }
    in_dependency && $1 == field ":" { print $2; exit }
    in_dependency && /^      [^ ]/ { exit }
  ' "$repo/pnpm-lock.yaml"
}
locked_spec="$(read_locked_field specifier)"
[ "$locked_spec" = "$spec" ] || fail 'pnpm-lock.yaml vouchington-tooling specifier does not match package.json'
locked_version="$(read_locked_field version)"
locked_version="${locked_version%%(*}"
case "$locked_version" in
  '' | *[!A-Za-z0-9._-]*) fail 'pnpm-lock.yaml has no exact vouchington-tooling version for the root importer' ;;
esac

# shellcheck disable=SC1091
. "$here/curl-to.sh"
tgz="$(mktemp "${TMPDIR:-/tmp}/vt.XXXXXX")"
trap 'rm -f -- "$tgz"' EXIT
ci_download_to \
  "https://registry.npmjs.org/vouchington-tooling/-/vouchington-tooling-${locked_version}.tgz" "$tgz" ||
  fail "failed to download vouchington-tooling@${locked_version}"
expected="$(
  grep -A1 "^  vouchington-tooling@${locked_version}:" "$repo/pnpm-lock.yaml" |
    sed -n 's/.*integrity: sha512-\([^}[:space:]]*\).*/\1/p' | head -n 1
)"
[ -n "$expected" ] || fail "pnpm-lock.yaml has no integrity for vouchington-tooling@${locked_version}"
actual="$(openssl dgst -sha512 -binary "$tgz" | openssl base64 -A)" ||
  fail 'cannot hash downloaded vouchington-tooling tarball'
[ "$actual" = "$expected" ] || fail 'downloaded vouchington-tooling tarball failed integrity check'

mkdir -p "$dest"
# Named package install must include the tarball's own dependencies: dest is an
# empty isolated prefix, not a workspace root.
(cd "$dest" &&
  npm_config_userconfig=/dev/null \
    npm_config_registry=https://registry.npmjs.org/ \
    npm install --no-save --ignore-scripts "$tgz")
