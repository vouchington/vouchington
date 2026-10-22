#!/usr/bin/env bash
# Resolve a published GHA script, then exec it. Usable before pnpm install:
# it falls back from the installed package to pnpm dlx, then to a
# lockfile-integrity-checked registry download.
# usage: exec-vouchington-gha.sh <cli-command> <scripts/gha/file.sh> [args...]
set -euo pipefail
if [ "$#" -lt 2 ]; then
  echo "usage: $0 <cli-command> <scripts/gha/file.sh> [args...]" >&2
  exit 2
fi
cmd="$1"
relative="$2"
shift 2
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"

fail() {
  echo "$0: $1" >&2
  exit 1
}

packaged="$(bash "$here/vouchington-tooling-script.sh" "$relative" 2>/dev/null || true)"
if [ -z "${packaged:-}" ] || [ ! -f "$packaged" ]; then
  if [ -f "$repo/node_modules/vouchington-tooling/$relative" ]; then
    packaged="$repo/node_modules/vouchington-tooling/$relative"
  fi
fi
if [ -n "${packaged:-}" ] && [ -f "$packaged" ]; then
  exec bash "$packaged" "$@"
fi

read_spec() {
  if command -v node >/dev/null 2>&1; then
    node -e "const pkg=require(process.argv[1]); const spec=pkg.dependencies?.['vouchington-tooling'] ?? pkg.devDependencies?.['vouchington-tooling']; if (!spec) throw new Error('vouchington-tooling is not listed'); process.stdout.write(String(spec))" \
      "$repo/package.json"
    return
  fi
  sed -n 's/^[[:space:]]*"vouchington-tooling": "\([^"]*\)".*/\1/p' "$repo/package.json" | head -n 1
}

spec="$(read_spec || true)"
case "$spec" in
  '' | *[!A-Za-z0-9.^_-]*) fail 'vouchington-tooling is not listed in package.json' ;;
esac

read_locked_field() {
  awk -v field="$1" '
    $0 == "  .:" { in_root = 1; next }
    in_root && /^  [^ ]/ { exit }
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

if command -v pnpm >/dev/null 2>&1 && command -v node >/dev/null 2>&1 &&
  pnpm --version >/dev/null 2>&1; then
  exec pnpm dlx --package "vouchington-tooling@${locked_version}" vouchington "$cmd" "$@"
fi

# shellcheck disable=SC1091
. "$here/curl-to.sh"
tgz="$(mktemp "${TMPDIR:-/tmp}/vt.XXXXXX")"
extract="$(mktemp -d "${TMPDIR:-/tmp}/vt.XXXXXX")"
script="$(mktemp "${TMPDIR:-/tmp}/vt-script.XXXXXX")"
trap 'rm -rf -- "$tgz" "$extract" "$script"' EXIT
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
tar -xzf "$tgz" -C "$extract" "package/${relative}" ||
  fail "vouchington-tooling@${locked_version} is missing ${relative}"
mv "$extract/package/${relative}" "$script"
chmod 700 "$script"
trap - EXIT
rm -rf -- "$tgz" "$extract"
exec bash "$script" "$@"
