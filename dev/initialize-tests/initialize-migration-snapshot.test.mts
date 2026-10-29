import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { stubPsql, runRecordedInitialize } from '../test-helpers/initialize-db.mts'
import { cleanupWorktreeDirs, makeWorktreeDir } from '../test-helpers/initialize.mts'

describe('initialize migration snapshot', () => {
  afterEach(cleanupWorktreeDirs)

  const migrationId = '0634-00-00-copyright-notices.sql'

  it('saves the applied migration ledger beside the initialization marker', async () => {
    const cwd = await makeWorktreeDir('feature-db-write-snapshot')
    const snapshot = join(cwd, '.initialized-migrations')
    const output = await runRecordedInitialize({
      cwd,
      env: { DATABASE_URL: 'postgres://example/voucha-x', INITIALIZED_MIGRATIONS_FILE: snapshot },
      script: `
    ${stubPsql(`printf '%s\\t%s\\n' ${migrationId} ${'b'.repeat(64)}`)}
    IS_MAIN=false write_initialized_migration_snapshot
    IS_MAIN=true INITIALIZED_MIGRATIONS_FILE="$record.main" write_initialized_migration_snapshot
    test ! -e "$record.main" && printf 'main skipped'
    `,
    })

    expect(await readFile(snapshot, 'utf8')).toBe(`${migrationId}\t${'b'.repeat(64)}\n`)
    expect(output).toBe('main skipped')
  })

  it('reports a saved snapshot whose migration was edited in place', async () => {
    const cwd = await makeWorktreeDir('feature-db-snapshot-drift')
    const snapshot = join(cwd, '.initialized-migrations')
    await writeFile(snapshot, `${migrationId}\t${'c'.repeat(64)}\n`)
    const run = (file: string) =>
      runRecordedInitialize({
        cwd,
        env: { INITIALIZED_MIGRATIONS_FILE: file },
        script: 'worktree_resource_initialized_migration_drift "$REPO_ROOT" >> "$record"',
      })

    expect(await run(snapshot)).toContain('differs from its local file')
    expect(await run(join(cwd, 'missing'))).toBe('')
  })

  it('demotes readiness to monorepo when the saved snapshot is stale', async () => {
    const cwd = await makeWorktreeDir('feature-db-snapshot-demote')
    const snapshot = join(cwd, '.initialized-migrations')
    await writeFile(snapshot, `${migrationId}\t${'c'.repeat(64)}\n`)
    const output = await runRecordedInitialize({
      cwd,
      env: { INITIALIZED_MIGRATIONS_FILE: snapshot },
      script: `
    worktree_resource_validate_migrations_current "$REPO_ROOT" || printf '%s:' "$WORKTREE_RESOURCE_STATUS" >> "$record"
    worktree_validated_capability "$REPO_ROOT" >> "$record"
    `,
    })

    expect(output).toBe('stale-migrations:monorepo')
  })
})
