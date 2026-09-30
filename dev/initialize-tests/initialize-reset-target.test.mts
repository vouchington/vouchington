import { afterEach, describe, expect, it } from 'vitest'

import {
  answerPsql,
  recordDropdbAndCreatedb,
  recordPsqlTarget,
  runRecordedInitialize,
  staleRecentlyViewedTopics,
  stubPsql,
} from '../test-helpers/initialize-db.mts'
import { cleanupWorktreeDirs, makeWorktreeDir } from '../test-helpers/initialize.mts'

// Records every psql argument, unlike recordPsqlTarget which keeps only the target and flag.
const recordEveryPsqlCall = `printf 'psql:%s:%s:%s\\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"`

async function runResetTarget(worktreeDir: string, script: string) {
  return runRecordedInitialize({
    cwd: await makeWorktreeDir(worktreeDir),
    script,
  })
}

describe('initialize reset target safety', () => {
  afterEach(cleanupWorktreeDirs)

  it('does not treat an explicit local PGHOST as making a remote DATABASE_URL reset safe', async () => {
    const output = await runResetTarget(
      'feature-db-reset-explicit-local-env',
      `
    DATABASE_URL=postgres://dbhost:15432/voucha-feature-db-reset-explicit-local-env
    DB_NAME=voucha-feature-db-reset-explicit-local-env
    PGHOST=localhost
    PGPORT=5432
    ${stubPsql(recordEveryPsqlCall, `printf 't'`)}
    ${recordDropdbAndCreatedb({ withTarget: true })}
    reset_database_if_schema_mismatch >/dev/null
    `,
    )

    expect(output).toBe('')
  })

  it('refuses non-local database initialization without explicit opt-in', async () => {
    const output = await runResetTarget(
      'feature-db-init-non-local',
      `
    DATABASE_URL=postgres://dbhost:15432/voucha-feature-db-init-non-local
    DB_NAME=voucha-feature-db-init-non-local
    ${stubPsql(recordEveryPsqlCall)}
    createdb() { printf 'create:%s:%s:%s\\n' "\${PGHOST:-}" "\${PGPORT:-}" "$1" >> "$record"; }
    ( ensure_database_exists >/dev/null ) || true
    `,
    )

    expect(output).toBe('')
  })

  it('runs stale reset maintenance commands on the DATABASE_URL target with opt-in', async () => {
    const output = await runResetTarget(
      'feature-db-reset-url-target',
      `
    DATABASE_URL=postgres://dbhost:15432/voucha-feature-db-reset-url-target
    DB_NAME=voucha-feature-db-reset-url-target
    PGHOST=localhost
    PGPORT=5432
    VOUCHA_ALLOW_NON_LOCAL_DB_RESET=1
    ${stubPsql(recordPsqlTarget, answerPsql(staleRecentlyViewedTopics))}
    ${recordDropdbAndCreatedb({ withTarget: true })}
    reset_database_if_schema_mismatch >/dev/null
    `,
    )

    expect(output).toContain('drop:dbhost:15432:voucha-feature-db-reset-url-target')
    expect(output).toContain('create:dbhost:15432:voucha-feature-db-reset-url-target')
  })
})
