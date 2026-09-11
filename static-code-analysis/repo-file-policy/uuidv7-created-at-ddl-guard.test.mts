import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { checkUuidv7CreatedAtDdl } from './uuidv7-created-at-ddl-guard.mts'
import { initSqlAst } from './sql-ast.mts'

describe('uuidv7-created-at-ddl-guard', () => {
  beforeAll(() => initSqlAst())

  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeRepo() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-uuidv7-created-at-ddl-guard-'))
    testDirs.push(dir)
    return dir
  }

  async function track(repoRoot: string, path: string, content: string) {
    await mkdir(dirname(join(repoRoot, path)), { recursive: true })
    await writeFile(join(repoRoot, path), content)
  }

  function runGuard(repoRoot: string, trackedFiles: string[]): string[] {
    const errors: string[] = []
    checkUuidv7CreatedAtDdl(repoRoot, trackedFiles, errors)
    return errors
  }

  const MIGRATION_PATH = 'backend/data-stores/psql/migrations/0999-00-00-test.sql'

  it('flags a uuidv7-keyed table whose created_at defaults to now()', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS widgets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now()
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(`::error file=${MIGRATION_PATH},line=3`)
    expect(errors[0]).toContain('widgets.created_at must be')
    expect(errors[0]).toContain('GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL')
    expect(errors[0]).toContain('found DEFAULT now()')
  })

  it('flags a uuidv7-keyed table whose created_at defaults to CURRENT_TIMESTAMP', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS gadgets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('gadgets.created_at must be')
    expect(errors[0]).toContain('found DEFAULT current_timestamp()')
  })

  it('allows a VIRTUAL created_at generated from uuid_extract_timestamp(id)', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS sprockets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);\n`,
    )
    expect(runGuard(dir, [MIGRATION_PATH])).toHaveLength(0)
  })

  it('allows a STORED created_at generated from uuid_extract_timestamp(id)', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS cogs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) STORED
);\n`,
    )
    expect(runGuard(dir, [MIGRATION_PATH])).toHaveLength(0)
  })

  it('allows a non-uuidv7 table whose created_at defaults to now()', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS legacy_counters (
  id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);\n`,
    )
    expect(runGuard(dir, [MIGRATION_PATH])).toHaveLength(0)
  })

  it('ignores a table that has no id column', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS keyless_events (
  event_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);\n`,
    )
    expect(runGuard(dir, [MIGRATION_PATH])).toHaveLength(0)
  })

  it('allows a uuidv7-keyed table with no created_at column', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS join_table (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  subject_id uuid NOT NULL,
  object_id uuid NOT NULL
);\n`,
    )
    expect(runGuard(dir, [MIGRATION_PATH])).toHaveLength(0)
  })

  it('does not flag a non-migration .sql file', async () => {
    const dir = await makeRepo()
    const viewFile = 'backend/data-stores/psql/views/0999-view.sql'
    await track(
      dir,
      viewFile,
      `CREATE OR REPLACE VIEW widgets_view AS
SELECT id, created_at FROM widgets WHERE created_at IS NOT NULL;\n`,
    )
    expect(runGuard(dir, [viewFile])).toHaveLength(0)
  })

  it('does not throw when the migration fails to parse', async () => {
    const dir = await makeRepo()
    await track(dir, MIGRATION_PATH, 'CREATE TABLE broken (\n')
    expect(runGuard(dir, [MIGRATION_PATH])).toHaveLength(0)
  })

  it('flags a table whose created_at has no DEFAULT at all', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS bare_timestamps (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('found a non-generated default')
  })

  it('flags a table-level PRIMARY KEY (id) form whose created_at defaults to now()', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS table_level_pk (
  id uuid NOT NULL DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('table_level_pk.created_at must be')
    expect(errors[0]).toContain('found DEFAULT now()')
  })

  it('flags a created_at generated from the wrong expression (not uuid_extract_timestamp(id))', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS mis_generated (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz GENERATED ALWAYS AS (now()) VIRTUAL
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('mis_generated.created_at must be')
    expect(errors[0]).toContain('found GENERATED ... AS (now(...))')
  })

  it('flags a created_at defaulting to a type-cast now()', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS cast_default (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now()::timestamptz
);\n`,
    )
    const errors = runGuard(dir, [MIGRATION_PATH])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('cast_default.created_at must be')
    expect(errors[0]).toContain('found DEFAULT now()')
  })

  it('flags each violating table independently in the same file', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      MIGRATION_PATH,
      `CREATE TABLE IF NOT EXISTS first_table (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS second_table (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now()
);\n`,
    )
    expect(runGuard(dir, [MIGRATION_PATH])).toHaveLength(2)
  })
})
