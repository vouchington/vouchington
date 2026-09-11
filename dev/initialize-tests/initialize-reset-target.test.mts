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
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-reset-target-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runHelper({ cwd, script }: { cwd: string; script: string }) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: { ...process.env, HOME: dirname(cwd) },
  })

  return result.stdout.trim()
}

describe('initialize reset target safety', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('does not treat an explicit local PGHOST as making a remote DATABASE_URL reset safe', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-explicit-local-env')
    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://dbhost:15432/voucha-feature-db-reset-explicit-local-env
    DB_NAME=voucha-feature-db-reset-explicit-local-env
    PGHOST=localhost
    PGPORT=5432
    record=$(mktemp)
    psql() { printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"; printf 't'; }
    dropdb() { printf 'drop:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1" >> "$record"; }
    createdb() { printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1" >> "$record"; }
    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('')
  })

  it('refuses non-local database initialization without explicit opt-in', async () => {
    const cwd = await makeWorktreeDir('feature-db-init-non-local')
    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://dbhost:15432/voucha-feature-db-init-non-local
    DB_NAME=voucha-feature-db-init-non-local
    record=$(mktemp)
    psql() { printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"; }
    createdb() { printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1" >> "$record"; }
    ( ensure_database_exists >/dev/null ) || true
    cat "$record"
    `,
    })

    expect(output).toBe('')
  })

  it('runs stale reset maintenance commands on the DATABASE_URL target with opt-in', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-url-target')
    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://dbhost:15432/voucha-feature-db-reset-url-target
    DB_NAME=voucha-feature-db-reset-url-target
    PGHOST=localhost
    PGPORT=5432
    VOUCHA_ALLOW_NON_LOCAL_DB_RESET=1
    record=$(mktemp)
    psql() {
  printf 'psql:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1 $2" >> "$record"
  case "$*" in *"to_regclass('migrations')"*|*"recently_viewed_topics"*) printf 't' ;; *) printf 'f' ;; esac
    }
    dropdb() { printf 'drop:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1" >> "$record"; }
    createdb() { printf 'create:%s:%s:%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1" >> "$record"; }
    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toContain('drop:dbhost:15432:voucha-feature-db-reset-url-target')
    expect(output).toContain('create:dbhost:15432:voucha-feature-db-reset-url-target')
  })
})
