import { afterEach, describe, expect, it } from 'vitest'

import {
  answerPsql,
  migratedDatabase,
  recordDropdbAndCreatedb,
  runRecordedInitialize,
  stubPsql,
} from '../test-helpers/initialize-db.mts'
import { cleanupWorktreeDirs, makeWorktreeDir } from '../test-helpers/initialize.mts'

// Posts-language drift is the third detector, so earlier probes must report healthy.
function postsLanguageProbe(reply: string) {
  return stubPsql(
    answerPsql([
      migratedDatabase,
      ['recently_viewed_topics', 'f'],
      ['community_auto_tagger_agents', 'f'],
      ['0070-00-00-posts-feed-content.sql', reply],
    ]),
  )
}

async function resetPostsLanguage(worktreeDir: string, dbName: string, reply: string) {
  return runRecordedInitialize({
    cwd: await makeWorktreeDir(worktreeDir),
    env: { DATABASE_URL: '' },
    script: `
    DB_NAME=${dbName}
    ${postsLanguageProbe(reply)}
    ${recordDropdbAndCreatedb()}
    reset_database_if_schema_mismatch >/dev/null
    `,
  })
}

describe('initialize posts language stale database checks', () => {
  afterEach(cleanupWorktreeDirs)

  it('resets a stale database when posts language columns are missing', async () => {
    const output = await resetPostsLanguage(
      'feature-db-reset-posts-language',
      'voucha-feature-db-reset-posts-language',
      'applied posts migration is missing language columns used by view_posts',
    )

    expect(output).toBe(
      'drop:voucha-feature-db-reset-posts-language\ncreate:voucha-feature-db-reset-posts-language',
    )
  })

  it('resets a stale database when view_posts is missing posts language columns', async () => {
    const output = await resetPostsLanguage(
      'feature-db-reset-view-posts-language',
      'voucha-feature-db-reset-view-posts-language',
      'existing view_posts is missing posts language columns',
    )

    expect(output).toBe(
      'drop:voucha-feature-db-reset-view-posts-language\ncreate:voucha-feature-db-reset-view-posts-language',
    )
  })

  it('keeps a database intact when posts language columns are present', async () => {
    const output = await resetPostsLanguage(
      'feature-db-posts-language-healthy',
      'voucha-feature-db-posts-language-healthy',
      '',
    )

    expect(output).toBe('')
  })
})
