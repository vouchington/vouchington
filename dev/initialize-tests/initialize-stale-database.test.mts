import { afterEach, describe, expect, it } from 'vitest'

import {
  answerPsql,
  migratedDatabase,
  recordDropdbAndCreatedb,
  runRecordedInitialize,
  staleRecentlyViewedTopics,
  stubPsql,
} from '../test-helpers/initialize-db.mts'
import { cleanupWorktreeDirs, makeWorktreeDir } from '../test-helpers/initialize.mts'

// Runs reset_database_if_schema_mismatch against DB_NAME's default database URL, returning the
// dropdb/createdb calls it made.
async function resetIfSchemaMismatch(worktreeDir: string, script: string) {
  return runRecordedInitialize({
    cwd: await makeWorktreeDir(worktreeDir),
    env: { DATABASE_URL: '' },
    script: `${recordDropdbAndCreatedb()}\n${script}\nreset_database_if_schema_mismatch >/dev/null`,
  })
}

describe('initialize stale database checks', () => {
  afterEach(cleanupWorktreeDirs)

  it('resets a stale database when recently viewed parent tables are missing', async () => {
    const output = await resetIfSchemaMismatch(
      'feature-db-reset',
      `
    DB_NAME=voucha-feature-db-reset
    ${stubPsql(answerPsql(staleRecentlyViewedTopics))}
    `,
    )

    expect(output).toBe('drop:voucha-feature-db-reset\ncreate:voucha-feature-db-reset')
  })

  it('resets a stale database when the landing pages table is missing', async () => {
    const output = await resetIfSchemaMismatch(
      'feature-db-reset-landing-pages',
      `
    DB_NAME=voucha-feature-db-reset-landing-pages
    ${stubPsql(
      answerPsql([
        migratedDatabase,
        ['0170-00-05-recently-viewed-landing-pages.sql', 't'],
        ['recently_viewed_landing_pages', 'f'],
      ]),
    )}
    `,
    )

    expect(output).toBe(
      'drop:voucha-feature-db-reset-landing-pages\ncreate:voucha-feature-db-reset-landing-pages',
    )
  })

  it('keeps a database intact when landing pages are missing before their migration', async () => {
    const output = await resetIfSchemaMismatch(
      'feature-db-reset-landing-pages-pre-migration',
      `
    DB_NAME=voucha-feature-db-reset-landing-pages-pre-migration
    psql_calls=$(mktemp)
    printf '0' > "$psql_calls"

    ${stubPsql(
      'count=$(cat "$psql_calls")',
      'count=$((count + 1))',
      `printf '%s' "$count" > "$psql_calls"`,
      `case "$count" in
    1) printf 't' ;;
    2) printf 'f' ;;
    *) ${answerPsql([['0070-00-00-posts-feed-content.sql', '']])} ;;
  esac`,
    )}
    `,
    )

    expect(output).toBe('')
  })

  it('resets a stale database when the community auto-tagger table is missing', async () => {
    const output = await resetIfSchemaMismatch(
      'feature-db-reset-community-auto-tagger',
      `
    DB_NAME=voucha-feature-db-reset-community-auto-tagger
    ${stubPsql(
      answerPsql([
        migratedDatabase,
        ['recently_viewed_topics', 'f'],
        ['community_auto_tagger_agents', 't'],
      ]),
    )}
    `,
    )

    expect(output).toBe(
      'drop:voucha-feature-db-reset-community-auto-tagger\ncreate:voucha-feature-db-reset-community-auto-tagger',
    )
  })

  it('keeps a healthy database intact', async () => {
    const output = await resetIfSchemaMismatch(
      'feature-db-healthy',
      `
    DB_NAME=voucha-feature-db-healthy
    ${stubPsql(
      answerPsql([
        migratedDatabase,
        ['recently_viewed_topics', 'f'],
        ['0070-00-00-posts-feed-content.sql', ''],
      ]),
    )}
    `,
    )

    expect(output).toBe('')
  })

  it('does not inspect or reset the main worktree database', async () => {
    const output = await resetIfSchemaMismatch(
      'main-db-no-reset',
      `
    IS_MAIN=true
    DB_NAME=voucha
    ${stubPsql(`printf 'unexpected psql call\\n' >> "$record"`)}
    `,
    )

    expect(output).toBe('')
  })

  it('returns early when the migrations table is absent', async () => {
    const output = await resetIfSchemaMismatch(
      'feature-db-fresh',
      `
    DB_NAME=voucha-feature-db-fresh
    ${stubPsql("printf 'f'")}
    `,
    )

    expect(output).toBe('')
  })
})
