import { afterEach, describe, expect, it } from 'vitest'

import {
  answerPsql,
  recordDropdbAndCreatedb,
  recordPsqlTarget,
  runRecordedInitialize,
  staleRecentlyViewedTopics,
  stubPsql,
} from '../test-helpers/initialize-db.mts'
import {
  cleanupWorktreeDirs,
  makeWorktreeDir,
  worktreeEnvAssignments,
} from '../test-helpers/initialize.mts'

// dev/initialize's backend phase lets DATABASE_URL name the database before creating it.
const deriveDbNameFromUrl = `url_db_name=$(db_name_from_url)
if [ -n "$url_db_name" ]; then DB_NAME="$url_db_name"; fi`

// Regenerates and loads .env the way dev/initialize's backend phase does.
const writeAndLoadWorktreeEnv = `write_worktree_env >/dev/null
set -a
source .env
set +a
${deriveDbNameFromUrl}`

// Runs `script` with dropdb/createdb stubs that record the PGHOST/PGPORT each call ran under;
// the default psql stub records its target the same way.
async function runWithDbStubs(
  worktreeDir: string,
  script: string,
  psql = stubPsql(recordPsqlTarget),
) {
  return runRecordedInitialize({
    cwd: await makeWorktreeDir(worktreeDir),
    script: `${psql}\n${recordDropdbAndCreatedb({ withTarget: true })}\n${script}`,
  })
}

describe('initialize database host handling', () => {
  afterEach(cleanupWorktreeDirs)

  it('uses the DATABASE_URL host and port when creating a missing database', async () => {
    const output = await runWithDbStubs(
      'feature-db-create-host-port',
      `
    DATABASE_URL=postgres://localhost:15432/voucha-feature-db-create-host-port
    DB_NAME=voucha-feature-db-create-host-port
    ensure_database_exists >/dev/null
    `,
    )

    expect(output).toBe(
      'psql:localhost:15432:--dbname=postgres -lqt\ncreate:localhost:15432:voucha-feature-db-create-host-port',
    )
  })

  it('uses the DATABASE_URL host and port when resetting a stale database', async () => {
    const output = await runWithDbStubs(
      'feature-db-reset-host-port',
      `
    DATABASE_URL=postgres://localhost:15432/voucha-feature-db-reset-host-port
    DB_NAME=voucha-feature-db-reset-host-port
    reset_database_if_schema_mismatch >/dev/null
    `,
      stubPsql(recordPsqlTarget, answerPsql(staleRecentlyViewedTopics)),
    )

    expect(output).toContain(
      'psql:localhost:15432:postgres://localhost:15432/voucha-feature-db-reset-host-port -Atqc',
    )
    expect(output).toContain('drop:localhost:15432:voucha-feature-db-reset-host-port')
    expect(output).toContain('create:localhost:15432:voucha-feature-db-reset-host-port')
  })

  it('preserves custom DATABASE_URL when regenerating .env', async () => {
    const output = await runWithDbStubs(
      'feature-db-preserve-custom-url',
      `
    DATABASE_URL=postgres://dbhost:15432/voucha-default
    VOUCHA_ALLOW_NON_LOCAL_DB_INIT=1
    DB_NAME=voucha-default
    ${worktreeEnvAssignments('feature-db-preserve-custom-url')}
    ${writeAndLoadWorktreeEnv}
    ensure_database_exists >/dev/null
    `,
    )

    expect(output).toBe(
      'psql:dbhost:15432:--dbname=postgres -lqt\ncreate:dbhost:15432:voucha-default',
    )
  })

  it('discards DATABASE_URL from a stale worktree .env', async () => {
    const output = await runWithDbStubs(
      'feature-db-ignore-stale-url',
      `
    cat > .env <<'ENV'
export WORKTREE_DIR=old-worktree
export DATABASE_URL=postgres://oldhost:15432/voucha-old-worktree
ENV
    unset DATABASE_URL
    DB_NAME=voucha-feature-db-ignore-stale-url
    ${worktreeEnvAssignments('feature-db-ignore-stale-url')}
    ${writeAndLoadWorktreeEnv}
    ensure_database_exists >/dev/null
    `,
    )

    expect(output).toBe(
      'psql:localhost::--dbname=postgres -lqt\ncreate:localhost::voucha-feature-db-ignore-stale-url',
    )
  })

  it('preserves spaces when checking for an existing database', async () => {
    const output = await runWithDbStubs(
      'feature-db-space-name',
      `
    DATABASE_URL=postgres://localhost:15432/voucha%20space
    DB_NAME="voucha space"
    ensure_database_exists >/dev/null
    `,
      stubPsql(recordPsqlTarget, "printf ' voucha space | owner\\n'"),
    )

    expect(output).toBe('psql:localhost:15432:--dbname=postgres -lqt')
  })

  it('skips stale schema reset for non-local database targets without opt-in', async () => {
    const output = await runWithDbStubs(
      'feature-db-reset-non-local',
      `
    DATABASE_URL=postgres://dbhost:15432/voucha-feature-db-reset-non-local
    DB_NAME=voucha-feature-db-reset-non-local
    reset_database_if_schema_mismatch >/dev/null
    `,
      stubPsql(answerPsql(staleRecentlyViewedTopics)),
    )

    expect(output).toBe('')
  })

  it('re-derives DB_NAME from DATABASE_URL before creating the database', async () => {
    const output = await runWithDbStubs(
      'feature-db-custom-name',
      `
    DATABASE_URL=postgres://localhost:15432/voucha-custom-from-env
    DB_NAME=voucha-feature-db-custom-name
    ${deriveDbNameFromUrl}
    ensure_database_exists >/dev/null
    `,
    )

    expect(output).toBe(
      'psql:localhost:15432:--dbname=postgres -lqt\ncreate:localhost:15432:voucha-custom-from-env',
    )
  })
})
