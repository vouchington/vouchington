import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

import { read, readPool, write } from './index.mts'
import type { QueryExecutor, QueryInput } from './types.mts'
import {
  applyAllMigrations,
  runAllMigrations,
  runMigrations,
  runViews,
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
    const disconnected = new Promise<void>(resolve => {
      client.once('error', () => {
        resolve()
      })
    })
    const verifySchema = vi.fn<VerifySchemaAfterMigration>(async () => {
      const terminated = await write<{ terminated: boolean }>(
        '/* terminateIdleVerificationConnection */ SELECT pg_terminate_backend($1) AS terminated',
        [pid],
      )
      expect(terminated.rows[0]?.terminated).toBe(true)
      await disconnected
      expect(readPool.totalCount).toBeLessThan(poolCountBeforeTermination)
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

  it('initializes SQL tooling for forced views through the public entry point', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-forced-views-'))
    const folder = join(root, 'views')
    const viewName = `forced_view_${randomUUID().replaceAll('-', '')}`
    const statements: string[] = []

    try {
      await mkdir(folder)
      await writeFile(
        join(folder, 'forced.sql'),
        `CREATE OR REPLACE VIEW ${viewName} AS SELECT 1 AS id;`,
      )

      await runViews({ folder, forced: true, writer: makeMigrationWriter(statements) })

      expect(statements).toHaveLength(2)
      expect(statements[0]).toContain(`DROP VIEW IF EXISTS ${viewName}`)
      expect(statements[1]).toContain(`CREATE OR REPLACE VIEW ${viewName}`)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('keeps ordinary view rebuilds on the non-forced path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-views-'))
    const folder = join(root, 'views')
    const viewName = `view_${randomUUID().replaceAll('-', '')}`
    const statements: string[] = []

    try {
      await mkdir(folder)
      await writeFile(
        join(folder, 'view.sql'),
        `CREATE OR REPLACE VIEW ${viewName} AS SELECT 1 AS id;`,
      )

      await runViews({ folder, writer: makeMigrationWriter(statements) })

      expect(statements).toEqual([
        `/* runViews */ CREATE OR REPLACE VIEW ${viewName} AS SELECT 1 AS id`,
      ])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
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
      // The runner rejects a directory that omits an applied ledger file.
      // Symlinks keep generator imports resolving from the real migrations tree.
      await linkAppliedFixedMigrations(join(root, 'migrations'))

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
})

function makeMigrationWriter(statements: string[]): QueryExecutor {
  return (input: QueryInput): Promise<pg.QueryResult> => {
    statements.push(stringFromUnknown(input))
    return Promise.resolve({ command: '', fields: [], oid: 0, rowCount: 0, rows: [] })
  }
}

async function linkAppliedFixedMigrations(migrationsDir: string): Promise<void> {
  const { rows } = await read<{ id: string }>(
    '/* listAppliedFixedMigrations */ SELECT id FROM migrations ORDER BY id',
  )
  const sourceDir = join(import.meta.dirname, 'migrations')
  await Promise.all(
    rows.map(row => {
      const fileName = row.id
      if (fileName !== basename(fileName)) {
        throw new Error(`Applied migration id is not a file name: ${fileName}`)
      }
      return symlink(join(sourceDir, fileName), join(migrationsDir, fileName))
    }),
  )
}
