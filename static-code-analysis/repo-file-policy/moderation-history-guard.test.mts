import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { checkModerationHistoryGuard } from './moderation-history-guard.mts'
import { initSqlAst } from './sql-ast.mts'

describe('moderation-history-guard', () => {
  beforeAll(() => initSqlAst())

  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeRepo() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-moderation-history-guard-'))
    testDirs.push(dir)
    return dir
  }

  async function track(repoRoot: string, path: string, content: string) {
    await mkdir(dirname(join(repoRoot, path)), { recursive: true })
    await writeFile(join(repoRoot, path), content)
  }

  function runGuard(repoRoot: string, trackedFiles: string[]): string[] {
    const errors: string[] = []
    checkModerationHistoryGuard(repoRoot, trackedFiles, errors)
    return errors
  }

  const MIGRATION_PATH = 'backend/data-stores/psql/migrations/0999-00-00-test.sql'

  it('flags a table with frozen_at but no lifted_at', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS topic_freezes (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES topics ON DELETE CASCADE,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  frozen_by_id UUID REFERENCES users ON DELETE SET NULL
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(
      '::error file=backend/data-stores/psql/migrations/0999-00-00-test.sql',
    )
    expect(errors[0]).toContain('topic_freezes.frozen_at')
    expect(errors[0]).toContain('lifted_at history table')
    expect(errors[0]).toContain('#5154')
  })

  it('allows a proper history table that has lifted_at', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS community_bans (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  banned_by_id UUID REFERENCES users ON DELETE SET NULL,
  lifted_at TIMESTAMPTZ,
  lifted_by_id UUID REFERENCES users ON DELETE SET NULL
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(0)
  })

  it('flags a bare BOOLEAN moderation column without lifted_at', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS link_submissions (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  url TEXT NOT NULL,
  blocked BOOLEAN
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('link_submissions.blocked')
  })

  it(
    'allows a bare BOOLEAN moderation column when lifted_at is also present',
    {
      timeout: 10_000,
    },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        MIGRATION_PATH,
        `CREATE TABLE IF NOT EXISTS link_blocks (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  url_id UUID NOT NULL REFERENCES urls ON DELETE CASCADE,
  blocked_by_id UUID REFERENCES users ON DELETE SET NULL,
  lifted_at TIMESTAMPTZ,
  lifted_by_id UUID REFERENCES users ON DELETE SET NULL
);\n`,
      )
      const errors = runGuard(dir, [MIGRATION_PATH])
      expect(errors).toHaveLength(0)
    },
  )

  it('ignores a commented-out moderation column', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS topic_items (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  topic_id UUID NOT NULL
  -- suspended_at TIMESTAMPTZ
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(0)
  })

  it(
    'allows a membership table with removed_at/removed_by_id (soft-delete append-only pattern)',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        MIGRATION_PATH,
        `CREATE TABLE IF NOT EXISTS community_members (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL
);\n`,
      )
      const errors = runGuard(dir, [MIGRATION_PATH])
      expect(errors).toHaveLength(0)
    },
  )

  it(
    'allows a blocked BOOLEAN column with the moderation-history-guard-allow directive',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        MIGRATION_PATH,
        `CREATE TABLE IF NOT EXISTS url_hostnames (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  hostname TEXT NOT NULL,
  blocked BOOLEAN, -- moderation-history-guard-allow: trigger-maintained from url_hostname_blocks
  crawlable BOOLEAN
);\n`,
      )
      const errors = runGuard(dir, [MIGRATION_PATH])
      expect(errors).toHaveLength(0)
    },
  )

  it(
    'flags a blocked BOOLEAN column WITHOUT the moderation-history-guard-allow directive',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        MIGRATION_PATH,
        `CREATE TABLE IF NOT EXISTS url_hostnames (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  hostname TEXT NOT NULL,
  blocked BOOLEAN,
  crawlable BOOLEAN
);\n`,
      )
      const errors = runGuard(dir, [MIGRATION_PATH])
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('url_hostnames.blocked')
    },
  )

  it('does not flag a non-migration .sql file', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    const viewFile = 'backend/data-stores/psql/views/0999-view.sql'
    await track(
      dir,
      viewFile,
      `CREATE OR REPLACE VIEW view_suspended_users AS
SELECT id, suspended_at FROM users WHERE suspended_at IS NOT NULL;\n`,
    )
    const errors = runGuard(dir, [viewFile])
    expect(errors).toHaveLength(0)
  })

  it('reports SQL parse errors', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(dir, MIGRATION_PATH, 'CREATE TABLE broken (\n')
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('failed to parse SQL')
  })

  it(
    'produces one error per table (not one per moderation column)',
    {
      timeout: 10_000,
    },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        MIGRATION_PATH,
        `CREATE TABLE IF NOT EXISTS user_mutes (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  muted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  muted_by_id UUID REFERENCES users ON DELETE SET NULL,
  muted_reason TEXT
);\n`,
      )
      const errors = runGuard(dir, [MIGRATION_PATH])
      expect(errors).toHaveLength(1)
    },
  )

  it(
    'flags each violating table independently in the same file',
    {
      timeout: 10_000,
    },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        MIGRATION_PATH,
        `CREATE TABLE IF NOT EXISTS user_silences (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  silenced_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_mutes (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  muted_at TIMESTAMPTZ
);\n`,
      )
      const errors = runGuard(dir, [MIGRATION_PATH])
      expect(errors).toHaveLength(2)
    },
  )
})
