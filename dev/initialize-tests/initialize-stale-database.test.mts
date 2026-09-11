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
    env: { ...process.env, DATABASE_URL: '', HOME: home ?? dirname(cwd) },
  })

  return result.stdout.trim()
}

describe('initialize stale database checks', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('resets a stale database when recently viewed parent tables are missing', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-reset
    record=$(mktemp)

    psql() {
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

    dropdb() { printf 'drop:%s\\n' "$1" >> "$record"; }
    createdb() { printf 'create:%s\\n' "$1" >> "$record"; }

    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('drop:voucha-feature-db-reset\ncreate:voucha-feature-db-reset')
  })

  it('resets a stale database when the landing pages table is missing', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-landing-pages')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-reset-landing-pages
    record=$(mktemp)

    psql() {
  case "$*" in
    *"to_regclass('migrations')"*)
      printf 't'
      ;;
    *"0170-00-05-recently-viewed-landing-pages.sql"*)
      printf 't'
      ;;
    *"recently_viewed_landing_pages"*)
      printf 'f'
      ;;
    *)
      printf 'f'
      ;;
  esac
    }

    dropdb() {
  printf 'drop:%s\\n' "$1" >> "$record"
    }

    createdb() {
  printf 'create:%s\\n' "$1" >> "$record"
    }

    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe(
      'drop:voucha-feature-db-reset-landing-pages\ncreate:voucha-feature-db-reset-landing-pages',
    )
  })

  it('keeps a database intact when landing pages are missing before their migration', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-landing-pages-pre-migration')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-reset-landing-pages-pre-migration
    record=$(mktemp)
    psql_calls=$(mktemp)
    printf '0' > "$psql_calls"

    psql() {
  count=$(cat "$psql_calls")
  count=$((count + 1))
  printf '%s' "$count" > "$psql_calls"
  case "$count" in
    1)
      printf 't'
      ;;
    2)
      printf 'f'
      ;;
    *)
      case "$*" in
        *"0070-00-00-posts-feed-content.sql"*) ;;
        *) printf 'f' ;;
      esac
      ;;
  esac
    }

    dropdb() {
  printf 'drop:%s\\n' "$1" >> "$record"
    }

    createdb() {
  printf 'create:%s\\n' "$1" >> "$record"
    }

    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('')
  })

  it('resets a stale database when the community auto-tagger table is missing', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-community-auto-tagger')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-reset-community-auto-tagger
    record=$(mktemp)

    psql() {
  case "$*" in
    *"to_regclass('migrations')"*)
      printf 't'
      ;;
    *"recently_viewed_topics"*)
      printf 'f'
      ;;
    *"community_auto_tagger_agents"*)
      printf 't'
      ;;
    *)
      printf 'f'
      ;;
  esac
    }

    dropdb() {
  printf 'drop:%s\\n' "$1" >> "$record"
    }

    createdb() {
  printf 'create:%s\\n' "$1" >> "$record"
    }

    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe(
      'drop:voucha-feature-db-reset-community-auto-tagger\ncreate:voucha-feature-db-reset-community-auto-tagger',
    )
  })

  it('keeps a healthy database intact', async () => {
    const cwd = await makeWorktreeDir('feature-db-healthy')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-healthy
    record=$(mktemp)

    psql() {
  case "$*" in
    *"to_regclass('migrations')"*)
      printf 't'
      ;;
    *"recently_viewed_topics"*)
      printf 'f'
      ;;
    *"0070-00-00-posts-feed-content.sql"*)
      ;;
    *)
      printf 'f'
      ;;
  esac
    }

    dropdb() {
  printf 'drop:%s\\n' "$1" >> "$record"
    }

    createdb() {
  printf 'create:%s\\n' "$1" >> "$record"
    }

    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('')
  })

  it('does not inspect or reset the main worktree database', async () => {
    const cwd = await makeWorktreeDir('main-db-no-reset')

    const output = await runHelper({
      cwd,
      script: `
    IS_MAIN=true
    DB_NAME=voucha
    record=$(mktemp)

    psql() { printf 'unexpected psql call\\n' >> "$record"; }
    dropdb() { printf 'drop:%s\\n' "$1" >> "$record"; }
    createdb() { printf 'create:%s\\n' "$1" >> "$record"; }

    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('')
  })

  it('returns early when the migrations table is absent', async () => {
    const cwd = await makeWorktreeDir('feature-db-fresh')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-fresh
    record=$(mktemp)

    psql() {
  printf 'f'
    }

    dropdb() {
  printf 'drop:%s\\n' "$1" >> "$record"
    }

    createdb() {
  printf 'create:%s\\n' "$1" >> "$record"
    }

    reset_database_if_schema_mismatch >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('')
  })
})
