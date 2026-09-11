import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)
const testDirs: string[] = []

async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runHelper({ cwd, script, home }: { cwd: string; script: string; home?: string }) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: {
      ...process.env,
      HOME: home ?? dirname(cwd),
    },
  })

  return result.stdout.trim()
}

describe('initialize database host handling', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses the DATABASE_URL host and port when creating a missing database', async () => {
    const cwd = await makeWorktreeDir('feature-db-create-host-port')

    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://localhost:15432/voucha-feature-db-create-host-port
    DB_NAME=voucha-feature-db-create-host-port
    record=$(mktemp)

    psql() {
  printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    createdb() {
  printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    ensure_database_exists >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe(
      'psql:localhost:15432:--dbname=postgres -lqt\ncreate:localhost:15432:voucha-feature-db-create-host-port',
    )
  })

  it('uses the DATABASE_URL host and port when resetting a stale database', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-host-port')

    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://localhost:15432/voucha-feature-db-reset-host-port
    DB_NAME=voucha-feature-db-reset-host-port
    record=$(mktemp)

    psql() {
  printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1 $2" >> "$record"
  case "$*" in
    *"to_regclass('migrations')"*)
      printf 't'
      ;;
    *"recently_viewed_topics"*)
      printf 't'
      ;;
    *)
      printf 'f'
      ;;
  esac
    }

    dropdb() {
  printf 'drop:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1" >> "$record"
    }

    createdb() {
  printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1" >> "$record"
    }

    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toContain(
      'psql:localhost:15432:postgres://localhost:15432/voucha-feature-db-reset-host-port -Atqc',
    )
    expect(output).toContain('drop:localhost:15432:voucha-feature-db-reset-host-port')
    expect(output).toContain('create:localhost:15432:voucha-feature-db-reset-host-port')
  })

  it('preserves custom DATABASE_URL when regenerating .env', async () => {
    const cwd = await makeWorktreeDir('feature-db-preserve-custom-url')

    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://dbhost:15432/voucha-default
    VOUCHA_ALLOW_NON_LOCAL_DB_INIT=1
    DB_NAME=voucha-default
    VALKEY_PORT=6379
    WORKTREE_DIR=feature-db-preserve-custom-url
    BACKEND_PORT=3001
    VALKEY_CONTAINER=voucha-valkey-test
    WORKER_PORT=8788
    IMAGE_LAMBDA_PORT=4001
    NEXT_PORT=3002
    STORYBOOK_PORT=6006
    INSPECTOR_PORT=9229
    CF_WORKER_SECRET=secret
    API_KEY_CHECKSUM_SECRET=checksum
    VOUCHA_OTP_TOKEN_HASH_SECRET=otp
    VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
    FINAL_WEB_PUSH_PUBLIC_KEY=public
    FINAL_WEB_PUSH_PRIVATE_KEY=private
    FINAL_WEB_PUSH_SUBJECT=mailto:tests+db-url@voucha.ai
    record=$(mktemp)

    psql() {
  printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    createdb() {
  printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    write_worktree_env >/dev/null
    set -a
    source .env
    set +a
    url_db_name=$(db_name_from_url)
    if [ -n "$url_db_name" ]; then
  DB_NAME="$url_db_name"
    fi
    ensure_database_exists >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe(
      'psql:dbhost:15432:--dbname=postgres -lqt\ncreate:dbhost:15432:voucha-default',
    )
  })

  it('discards DATABASE_URL from a stale worktree .env', async () => {
    const cwd = await makeWorktreeDir('feature-db-ignore-stale-url')

    const output = await runHelper({
      cwd,
      script: `
    cat > .env <<'ENV'
export WORKTREE_DIR=old-worktree
export DATABASE_URL=postgres://oldhost:15432/voucha-old-worktree
ENV
    unset DATABASE_URL
    DB_NAME=voucha-feature-db-ignore-stale-url
    VALKEY_PORT=6379
    WORKTREE_DIR=feature-db-ignore-stale-url
    BACKEND_PORT=3001
    VALKEY_CONTAINER=voucha-valkey-test
    WORKER_PORT=8788
    IMAGE_LAMBDA_PORT=4001
    NEXT_PORT=3002
    STORYBOOK_PORT=6006
    INSPECTOR_PORT=9229
    CF_WORKER_SECRET=secret
    API_KEY_CHECKSUM_SECRET=checksum
    VOUCHA_OTP_TOKEN_HASH_SECRET=otp
    VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
    FINAL_WEB_PUSH_PUBLIC_KEY=public
    FINAL_WEB_PUSH_PRIVATE_KEY=private
    FINAL_WEB_PUSH_SUBJECT=mailto:tests+db-url@voucha.ai
    record=$(mktemp)

    psql() {
  printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    createdb() {
  printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    write_worktree_env >/dev/null
    set -a
    source .env
    set +a
    url_db_name=$(db_name_from_url)
    if [ -n "$url_db_name" ]; then
  DB_NAME="$url_db_name"
    fi
    ensure_database_exists >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe(
      'psql:localhost::--dbname=postgres -lqt\ncreate:localhost::voucha-feature-db-ignore-stale-url',
    )
  })

  it('preserves spaces when checking for an existing database', async () => {
    const cwd = await makeWorktreeDir('feature-db-space-name')

    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://localhost:15432/voucha%20space
    DB_NAME="voucha space"
    record=$(mktemp)

    psql() {
  printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
  printf ' voucha space | owner\n'
    }

    createdb() {
  printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    ensure_database_exists >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('psql:localhost:15432:--dbname=postgres -lqt')
  })

  it('skips stale schema reset for non-local database targets without opt-in', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-non-local')
    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://dbhost:15432/voucha-feature-db-reset-non-local
    DB_NAME=voucha-feature-db-reset-non-local
    record=$(mktemp)
    psql() { case "$*" in *"to_regclass('migrations')"*|*"recently_viewed_topics"*) printf 't' ;; *) printf 'f' ;; esac; }
    dropdb() { printf 'drop:%s\n' "$1" >> "$record"; }
    createdb() { printf 'create:%s\n' "$1" >> "$record"; }
    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('')
  })

  it('re-derives DB_NAME from DATABASE_URL before creating the database', async () => {
    const cwd = await makeWorktreeDir('feature-db-custom-name')

    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://localhost:15432/voucha-custom-from-env
    DB_NAME=voucha-feature-db-custom-name
    record=$(mktemp)

    psql() {
  printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    createdb() {
  printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    url_db_name=$(db_name_from_url)
    if [ -n "$url_db_name" ]; then
  DB_NAME="$url_db_name"
    fi
    ensure_database_exists >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe(
      'psql:localhost:15432:--dbname=postgres -lqt\ncreate:localhost:15432:voucha-custom-from-env',
    )
  })
})
