import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Psql } from '@vouchington/postgres'
import { applyAllMigrations } from '@data-stores/psql/migrate'

/** Exercise the application runner with only its owned fixed, generated, and view fixture. */
export async function assertSerializedMigrationRunner(platform: Psql): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'voucha-all-migrations-'))
  const suffix = randomUUID().replaceAll('-', '')
  const baseTable = `all_migrations_base_${suffix}`
  const generatedTable = `all_migrations_generated_${suffix}`
  const view = `all_migrations_view_${suffix}`
  const migration = `9999-${suffix}.sql`
  const errors: unknown[] = []
  try {
    for (const folder of ['migrations', 'config-driven', 'views']) await mkdir(join(root, folder))
    await writeFile(
      join(root, 'migrations', migration),
      `CREATE TABLE ${baseTable} (id integer PRIMARY KEY);`,
    )
    await writeFile(
      join(root, 'config-driven', '9999-generated.sql'),
      `CREATE TABLE IF NOT EXISTS ${generatedTable} (id integer PRIMARY KEY);`,
    )
    await writeFile(
      join(root, 'views', '9999-view.sql'),
      `CREATE OR REPLACE VIEW ${view} AS SELECT id FROM ${baseTable};`,
    )
    const logger = { error: () => {}, log: () => {} }
    const settled = await Promise.allSettled([
      applyAllMigrations(root, { logger, platform }),
      applyAllMigrations(root, { logger, platform }),
    ])
    const failures = settled.flatMap(result =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    if (failures.length)
      throw new AggregateError(failures, 'Concurrent migrations failed', { cause: failures[0] })
    assert.deepEqual(
      settled.map(result => (result.status === 'fulfilled' ? result.value : undefined)),
      [undefined, undefined],
    )
    const { rows } = await platform.read<{
      ledger_count: number
      total_migrations: number
      relations_present: boolean
    }>(
      `/* verifyAllMigrationRunnerState */
        SELECT
          (SELECT count(*)::integer FROM migrations WHERE id = $1) AS ledger_count,
          (SELECT count(*)::integer FROM migrations) AS total_migrations,
          to_regclass($2) IS NOT NULL AND to_regclass($3) IS NOT NULL AS relations_present`,
      [migration, generatedTable, view],
    )
    assert.deepEqual(rows, [{ ledger_count: 1, total_migrations: 1, relations_present: true }])
  } catch (err) {
    errors.push(err)
  }
  const cleanup = [
    () => platform.write(`/* cleanupAllMigrationRunnerState */ DROP VIEW IF EXISTS ${view}`),
    () =>
      platform.write(`/* cleanupAllMigrationRunnerState */ DROP TABLE IF EXISTS ${generatedTable}`),
    () => platform.write(`/* cleanupAllMigrationRunnerState */ DROP TABLE IF EXISTS ${baseTable}`),
    () =>
      platform.write('/* cleanupAllMigrationRunnerState */ DELETE FROM migrations WHERE id = $1', [
        migration,
      ]),
    () => rm(root, { force: true, recursive: true }),
  ]
  for (const action of cleanup) {
    try {
      await action()
    } catch (err) {
      errors.push(err)
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Migration runner and owned cleanup failed', {
      cause: errors[0],
    })
}
