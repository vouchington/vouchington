import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

import { createMigrationPlatformFixture } from '@voucha/test-helpers/migration-platform'

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
    const pid = rows[0]?.pid
    if (pid === undefined) {
      client.release()
      throw new Error('Expected a PostgreSQL backend PID')
    }
    // Test pools evict idle clients after 100ms with client.end(), which does not
    // emit 'error'. pg-pool schedules that timer only while the pool is above its
    // minimum, so hold the floor until terminate delivers the idle-client error.
    const previousMin = readPool.options.min
    readPool.options.min = readPool.totalCount
    let released = false
    try {
      client.release()
      released = true
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
    } finally {
      readPool.options.min = previousMin
      if (!released) client.release()
    }
  })

  it('forwards the canonical package SQL folder and logger to the public platform runner', async () => {
    const run = vi
      .fn<NonNullable<Parameters<typeof runMigrations>[0]>['runMigrations']>()
      .mockResolvedValue(undefined)
    await runMigrations({ runMigrations: run })
    expect(run).toHaveBeenCalledExactlyOnceWith(resolve(import.meta.dirname, 'migrations'), {
      logger: console,
    })
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

  it('awaits fixed migrations and forwards one owned client through generated and view phases', async () => {
    const client = Object.assign(new pg.Client(), { release: () => {} })
    const fixture = await createMigrationPlatformFixture(client)
    const logger = { error: vi.fn<() => void>(), log: vi.fn<() => void>() }
    const operation = applyAllMigrations(fixture.root, { logger, platform: fixture.platform })
    // Observe rejection immediately, while the fixed phase is deliberately gated.
    const settled = operation.then(
      () => ({ status: 'fulfilled' as const }),
      err => ({ status: 'rejected' as const, reason: err }),
    )
    let primary: unknown
    let failed = false
    try {
      await Promise.race([fixture.fixedStarted, operation])
      expect(fixture.calls).toEqual([
        {
          phase: 'fixed',
          client: fixture.client,
          input: join(fixture.root, 'migrations'),
          logger,
        },
      ])
      fixture.releaseFixed()
      await operation
      expect(fixture.sessions).toBe(1)
      expect(fixture.calls.every(call => call.client === fixture.client)).toBe(true)
      const sql = fixture.calls.filter(call => call.phase === 'write').map(call => call.input)
      expect(sql).toContain('/* runConfigDrivenStatements */ SELECT 41 AS generated')
      expect(sql).toContain('/* runViews */ SELECT 42 AS view_phase')
      expect(sql.indexOf('/* runConfigDrivenStatements */ SELECT 41 AS generated')).toBeLessThan(
        sql.indexOf('/* runViews */ SELECT 42 AS view_phase'),
      )
    } catch (err) {
      primary = err
      failed = true
    }
    fixture.releaseFixed()
    const outcome = await settled
    const errors: unknown[] = failed ? [primary] : []
    if (outcome.status === 'rejected' && (!failed || !Object.is(outcome.reason, primary)))
      errors.push(outcome.reason)
    try {
      await fixture.close()
    } catch (err) {
      errors.push(err)
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1)
      throw new AggregateError(errors, 'Migration forwarding and cleanup failed', {
        cause: errors[0],
      })
  })
})

function makeMigrationWriter(statements: string[]): QueryExecutor {
  return (input: QueryInput): Promise<pg.QueryResult> => {
    statements.push(stringFromUnknown(input))
    return Promise.resolve({ command: '', fields: [], oid: 0, rowCount: 0, rows: [] })
  }
}
