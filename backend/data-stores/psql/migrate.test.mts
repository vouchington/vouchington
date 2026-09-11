import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { read, write } from './index.mts'
import {
  applyAllMigrations,
  runAllMigrations,
  runMigrations,
  type VerifySchemaAfterMigration,
} from './migrate.mts'

describe('applyAllMigrations', () => {
  it('passes the forced CLI flag through the all-migrations entry point', async () => {
    process.argv.push('--forced')
    const apply = vi.fn<typeof applyAllMigrations>().mockResolvedValue(undefined)
    const exit = vi.fn<typeof process.exit>()
    const logger = { error: vi.fn<(error: unknown) => void>(), log: vi.fn<() => void>() }
    const verifySchema = vi.fn<VerifySchemaAfterMigration>().mockResolvedValue(undefined)

    try {
      await runAllMigrations({ apply, exit, logger, verifySchema })
      expect(apply).toHaveBeenCalledWith(expect.any(String), { forced: true })
      expect(verifySchema).toHaveBeenCalledTimes(1)
      expect(exit).toHaveBeenNthCalledWith(1, 0)
      expect(logger.error).not.toHaveBeenCalled()
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--forced'), 1)
    }
  })

  it('fails the run when post-migration schema verification detects drift', async () => {
    const apply = vi.fn<typeof applyAllMigrations>().mockResolvedValue(undefined)
    const exit = vi.fn<typeof process.exit>()
    const logger = { error: vi.fn<(error: unknown) => void>(), log: vi.fn<() => void>() }
    const drift = new Error('schema snapshot does not match live database')
    const verifySchema = vi.fn<VerifySchemaAfterMigration>().mockRejectedValue(drift)

    await runAllMigrations({ apply, exit, logger, verifySchema })

    expect(verifySchema).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(drift)
    expect(exit).toHaveBeenNthCalledWith(1, 1)
    expect(logger.log).not.toHaveBeenCalledWith('Migrations complete!')
  })

  it('applies package SQL migrations through the platform runner', async () => {
    await runMigrations()
    const { rows } = await read<{ count: number }>(
      '/* verifyRunMigrationsLedger */ SELECT count(*)::integer AS count FROM migrations',
    )
    expect(rows[0]?.count).toBeGreaterThan(0)
  })

  it('serializes fixed, generated, and view migrations under one runner lock', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-all-migrations-'))
    const suffix = randomUUID().replaceAll('-', '')
    const baseTable = `all_migrations_base_${suffix}`
    const generatedTable = `all_migrations_generated_${suffix}`
    const view = `all_migrations_view_${suffix}`
    const migration = `9999-${suffix}.sql`

    try {
      await Promise.all(
        ['migrations', 'config-driven', 'views'].map(folder =>
          mkdir(join(root, folder), { recursive: true }),
        ),
      )
      await Promise.all([
        writeFile(
          join(root, 'migrations', migration),
          `CREATE TABLE ${baseTable} (id integer PRIMARY KEY);`,
        ),
        writeFile(
          join(root, 'config-driven', '9999-generated.sql'),
          `CREATE TABLE IF NOT EXISTS ${generatedTable} (id integer PRIMARY KEY);`,
        ),
        writeFile(
          join(root, 'views', '9999-view.sql'),
          `CREATE OR REPLACE VIEW ${view} AS SELECT id FROM ${baseTable};`,
        ),
      ])

      const logger = { error: () => {}, log: () => {} }
      await expect(
        Promise.all([applyAllMigrations(root, { logger }), applyAllMigrations(root, { logger })]),
      ).resolves.toEqual([undefined, undefined])

      const { rows } = await read<{ ledger_count: number; relations_present: boolean }>(
        `/* verifyAllMigrationRunnerState */
          SELECT
            (SELECT count(*)::integer FROM migrations WHERE id = $1) AS ledger_count,
            to_regclass($2) IS NOT NULL AND to_regclass($3) IS NOT NULL AS relations_present`,
        [migration, generatedTable, view],
      )
      expect(rows).toEqual([{ ledger_count: 1, relations_present: true }])
    } finally {
      await write(`/* cleanupAllMigrationRunnerState */ DROP VIEW IF EXISTS ${view}`)
      await write(
        `/* cleanupAllMigrationRunnerState */ DROP TABLE IF EXISTS ${generatedTable}, ${baseTable}`,
      )
      await write(`/* cleanupAllMigrationRunnerState */ DELETE FROM migrations WHERE id = $1`, [
        migration,
      ])
      await rm(root, { force: true, recursive: true })
    }
  })

  it('runs the post-commit hook only after the migration transaction commits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-post-commit-migrations-'))
    const suffix = randomUUID().replaceAll('-', '')
    const table = `post_commit_migrations_${suffix}`

    try {
      await mkdir(join(root, 'migrations'), { recursive: true })
      await Promise.all([
        mkdir(join(root, 'config-driven'), { recursive: true }),
        mkdir(join(root, 'views'), { recursive: true }),
      ])
      await writeFile(
        join(root, 'migrations', `9999-${suffix}.sql`),
        `CREATE TABLE ${table} (id integer PRIMARY KEY);`,
      )

      await applyAllMigrations(root, {
        afterCommit: async () => {
          const { rows } = await read<{ committed: boolean }>(
            `/* verifyPostCommitMigrationHook */ SELECT to_regclass($1) IS NOT NULL AS committed`,
            [table],
          )
          expect(rows).toEqual([{ committed: true }])
        },
        logger: { error: () => {}, log: () => {} },
      })
    } finally {
      await write(`/* cleanupPostCommitMigrationHook */ DROP TABLE IF EXISTS ${table}`)
      await rm(root, { force: true, recursive: true })
    }
  })
})
