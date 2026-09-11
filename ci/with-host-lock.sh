#!/usr/bin/env bash
# Bootstrap lock: used around pnpm install and around .NET/Swift work that runs
# before setup-node-pnpm. Maps VOUCHA_HOST_LOCK_* onto HOST_LOCK_*, then execs
# the published shell script. Prefer a local package copy so Node is optional;
# otherwise pnpm dlx, then a curl+tar fetch of the published tarball.
# Default root stays `/tmp/voucha-host-lock-$UID` so existing callers do not move.

set -u

fail() {
  echo "with-host-lock: $1" >&2
  exit 2
}

[ -z "${VOUCHA_HOST_LOCK_ACTIVE:-}" ] || fail 'nested host locks are not allowed'
[ -z "${HOST_LOCK_ACTIVE:-}" ] || fail 'nested host locks are not allowed'

if [ -z "${HOST_LOCK_ROOT:-}" ]; then
  if [ -n "${VOUCHA_HOST_LOCK_ROOT:-}" ]; then
    export HOST_LOCK_ROOT="$VOUCHA_HOST_LOCK_ROOT"
  else
    export HOST_LOCK_ROOT="/tmp/voucha-host-lock-$UID"
  fi
fi
if [ -n "${VOUCHA_HOST_LOCK_LEASE_SECONDS:-}" ] && [ -z "${HOST_LOCK_LEASE_SECONDS:-}" ]; then
  export HOST_LOCK_LEASE_SECONDS="$VOUCHA_HOST_LOCK_LEASE_SECONDS"
fi
if [ -n "${VOUCHA_HOST_LOCK_PROCESS_GROUP_DRAIN_SECONDS:-}" ] &&
  [ -z "${HOST_LOCK_PROCESS_GROUP_DRAIN_SECONDS:-}" ]; then
  export HOST_LOCK_PROCESS_GROUP_DRAIN_SECONDS="$VOUCHA_HOST_LOCK_PROCESS_GROUP_DRAIN_SECONDS"
fi

here="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
repo="$(CDPATH='' cd -- "$here/.." && pwd)"
relative='scripts/host-lock/with-host-lock.sh'
packaged="$repo/node_modules/vouchington-tooling/$relative"
if [ -f "$packaged" ]; then
  exec bash "$packaged" "$@"
fi

resolved="$(
  bash "$here/vouchington-tooling-script.sh" "$relative" 2>/dev/null || true
)"
if [ -n "${resolved:-}" ] && [ -f "$resolved" ]; then
  exec bash "$resolved" "$@"
fi

read_spec() {
  if command -v node >/dev/null 2>&1; then
    node -e "const pkg=require(process.argv[1]); const spec=pkg.dependencies?.['vouchington-tooling'] ?? pkg.devDependencies?.['vouchington-tooling']; if (!spec) throw new Error('vouchington-tooling is not listed in ' + process.argv[1]); process.stdout.write(spec)" \
      "$repo/package.json"
    return
  fi
    sed -n 's/^[[:space:]]*"vouchington-tooling": "\([^"]*\)".*/\1/p' "$repo/package.json" | head -n 1
}

spec="$(read_spec || true)"
spec="${spec#^}"
case "$spec" in
  '' | *[!A-Za-z0-9._-]*) fail 'vouchington-tooling is not listed in package.json' ;;
esac

if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1 &&
  pnpm --version >/dev/null 2>&1; then
  exec pnpm dlx --package "vouchington-tooling@${spec}" vouchington with-host-lock "$@"
fi

case "$HOST_LOCK_ROOT" in
  /*) ;;
  *) fail 'HOST_LOCK_ROOT must be an absolute path' ;;
esac
[ ! -L "$HOST_LOCK_ROOT" ] || fail "HOST_LOCK_ROOT must not be a symbolic link: $HOST_LOCK_ROOT"
old_umask=$(umask)
umask 077
mkdir -p "$HOST_LOCK_ROOT" || fail "cannot create HOST_LOCK_ROOT: $HOST_LOCK_ROOT"
umask "$old_umask"
[ ! -L "$HOST_LOCK_ROOT" ] || fail "HOST_LOCK_ROOT must not be a symbolic link: $HOST_LOCK_ROOT"
root_uid=$(stat -f '%u' "$HOST_LOCK_ROOT" 2>/dev/null) ||
  root_uid=$(stat -c '%u' "$HOST_LOCK_ROOT" 2>/dev/null) ||
  fail "cannot inspect HOST_LOCK_ROOT ownership: $HOST_LOCK_ROOT"
[ "$root_uid" = "$UID" ] || fail "HOST_LOCK_ROOT is not owned by uid $UID: $HOST_LOCK_ROOT"
chmod 700 "$HOST_LOCK_ROOT" || fail "cannot make HOST_LOCK_ROOT private: $HOST_LOCK_ROOT"

cached="$HOST_LOCK_ROOT/published-scripts/$spec/with-host-lock.sh"
if [ -e "$cached" ]; then
  [ ! -L "$cached" ] || fail "cached host-lock script must not be a symbolic link: $cached"
  [ -f "$cached" ] || fail "cached host-lock script must be a regular file: $cached"
  cached_uid=$(stat -f '%u' "$cached" 2>/dev/null) ||
    cached_uid=$(stat -c '%u' "$cached" 2>/dev/null) ||
    fail "cannot inspect cached host-lock script ownership: $cached"
  [ "$cached_uid" = "$UID" ] || fail "cached host-lock script is not owned by uid $UID: $cached"
else
  # shellcheck disable=SC1091
  . "$here/curl-to.sh"
  mkdir -p "$(dirname "$cached")"
  tgz="$(mktemp "${TMPDIR:-/tmp}/vt.XXXXXX")"
  extract="$(mktemp -d "${TMPDIR:-/tmp}/vt.XXXXXX")"
  trap 'rm -rf -- "$tgz" "$extract"' EXIT
  ci_download_to \
    "https://registry.npmjs.org/vouchington-tooling/-/vouchington-tooling-${spec}.tgz" "$tgz" ||
    fail "failed to download vouchington-tooling@${spec} for a shell-only host lock"
  expected="$(
    grep -A1 "^  vouchington-tooling@${spec}:" "$repo/pnpm-lock.yaml" |
      sed -n 's/.*integrity: sha512-\([^}[:space:]]*\).*/\1/p' | head -n 1
  )"
  [ -n "$expected" ] || fail "pnpm-lock.yaml has no integrity for vouchington-tooling@${spec}"
  actual="$(openssl dgst -sha512 -binary "$tgz" | openssl base64 -A)" ||
    fail 'cannot hash downloaded vouchington-tooling tarball'
  [ "$actual" = "$expected" ] || fail 'downloaded vouchington-tooling tarball failed integrity check'
  tar -xzf "$tgz" -C "$extract" "package/$relative" ||
    fail "vouchington-tooling@${spec} is missing $relative"
  [ ! -L "$extract/package/$relative" ] || fail 'published host-lock script must not be a symbolic link'
  mv "$extract/package/$relative" "$cached"
  chmod 700 "$cached" || fail "cannot make cached host-lock script private: $cached"
  rm -rf -- "$tgz" "$extract"
  trap - EXIT
fi
exec bash "$cached" "$@"
