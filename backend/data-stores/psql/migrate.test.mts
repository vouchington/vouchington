import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { read, readPool, write } from './index.mts'
import {
  applyAllMigrations,
  runAllMigrations,
  runMigrations,
  type PostCommitMigrationHook,
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
      expect(apply).toHaveBeenCalledWith(expect.any(String), {
        forced: true,
        afterCommit: expect.any(Function),
      })
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
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('committed, but schema verification did not complete'),
        cause: drift,
      }),
    )
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(logger.log).not.toHaveBeenCalledWith('Migrations complete!')
  })

  it('reports a terminated verification query as committed but unverified', async () => {
    const apply = vi.fn<typeof applyAllMigrations>().mockResolvedValue(undefined)
    const exit = vi.fn<typeof process.exit>()
    const logger = { error: vi.fn<(error: unknown) => void>(), log: vi.fn<() => void>() }
    const verifySchema = vi.fn<VerifySchemaAfterMigration>(async () => {
      await read('/* verifyTerminatedSchemaRead */ SELECT pg_terminate_backend(pg_backend_pid())')
    })

    await runAllMigrations({ apply, exit, logger, verifySchema })

    expect(verifySchema).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('committed, but schema verification did not complete'),
        cause: expect.objectContaining({ code: '57P01' }),
      }),
    )
    expect(logger.log).not.toHaveBeenCalledWith('Migrations complete!')
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('reports application failures separately from verification failures', async () => {
    const failure = new Error('migration DDL failed')
    const apply = vi.fn<typeof applyAllMigrations>().mockRejectedValue(failure)
    const exit = vi.fn<typeof process.exit>()
    const logger = { error: vi.fn<(error: unknown) => void>(), log: vi.fn<() => void>() }
    const verifySchema = vi.fn<VerifySchemaAfterMigration>().mockResolvedValue(undefined)

    await runAllMigrations({ apply, exit, logger, verifySchema })

    expect(verifySchema).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Migration application did not complete'),
        cause: failure,
      }),
    )
    expect(logger.log).not.toHaveBeenCalledWith('Migrations complete!')
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('reports a failed post-commit hook after migration application committed', async () => {
    const failure = new Error('post-commit enqueue failed')
    const apply = vi.fn<typeof applyAllMigrations>(async (_rootDir, options) => {
      await options?.afterCommit?.()
    })
    const afterCommit = vi.fn<PostCommitMigrationHook>().mockRejectedValue(failure)
    const exit = vi.fn<typeof process.exit>()
    const logger = { error: vi.fn<(error: unknown) => void>(), log: vi.fn<() => void>() }
    const verifySchema = vi.fn<VerifySchemaAfterMigration>().mockResolvedValue(undefined)

    await runAllMigrations({ apply, afterCommit, exit, logger, verifySchema })

    expect(verifySchema).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('post-commit hook did not complete'),
        cause: failure,
      }),
    )
    expect(logger.log).not.toHaveBeenCalledWith('Migrations complete!')
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('succeeds when an idle connection dies but verification completes', async () => {
    await write('/* warmMigrationControlPool */ SELECT 1')
    const apply = vi.fn<typeof applyAllMigrations>().mockResolvedValue(undefined)
    const exit = vi.fn<typeof process.exit>()
    const logger = { error: vi.fn<(error: unknown) => void>(), log: vi.fn<() => void>() }
    const client = await readPool.connect()
    const { rows } = await client.query<{ pid: number }>(
      '/* findIdleVerificationConnection */ SELECT pg_backend_pid() AS pid',
    )
    client.release()
    const pid = rows[0]?.pid
    if (pid === undefined) throw new Error('Expected a PostgreSQL backend PID')
    const poolCountBeforeTermination = readPool.totalCount
    const verifySchema = vi.fn<VerifySchemaAfterMigration>(async () => {
      const terminated = await write<{ terminated: boolean }>(
        '/* terminateIdleVerificationConnection */ SELECT pg_terminate_backend($1) AS terminated',
        [pid],
      )
      expect(terminated.rows[0]?.terminated).toBe(true)
      await vi.waitFor(() => expect(readPool.totalCount).toBeLessThan(poolCountBeforeTermination))
      const schemaRead = await read<{ migration_table: string | null }>(
        "/* verifyReadAfterIdleTermination */ SELECT to_regclass('migrations')::text AS migration_table",
      )
      expect(schemaRead.rows).toEqual([{ migration_table: 'migrations' }])
    })

    await runAllMigrations({ apply, exit, logger, verifySchema })

    expect(verifySchema).toHaveBeenCalledTimes(1)
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.log).toHaveBeenCalledWith('Migrations complete!')
    expect(exit).toHaveBeenCalledExactlyOnceWith(0)
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
