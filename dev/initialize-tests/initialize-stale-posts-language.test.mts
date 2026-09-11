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

describe('initialize posts language stale database checks', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('resets a stale database when posts language columns are missing', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-posts-language')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-reset-posts-language
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
      printf 'f'
      ;;
    *"0070-00-00-posts-feed-content.sql"*)
      printf 'applied posts migration is missing language columns used by view_posts'
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
      'drop:voucha-feature-db-reset-posts-language\ncreate:voucha-feature-db-reset-posts-language',
    )
  })

  it('resets a stale database when view_posts is missing posts language columns', async () => {
    const cwd = await makeWorktreeDir('feature-db-reset-view-posts-language')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-reset-view-posts-language
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
      printf 'f'
      ;;
    *"0070-00-00-posts-feed-content.sql"*)
      printf 'existing view_posts is missing posts language columns'
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
      'drop:voucha-feature-db-reset-view-posts-language\ncreate:voucha-feature-db-reset-view-posts-language',
    )
  })

  it('keeps a database intact when posts language columns are present', async () => {
    const cwd = await makeWorktreeDir('feature-db-posts-language-healthy')

    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-posts-language-healthy
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
})
