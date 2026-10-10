import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'

import type { QueryExecutor, QueryInput } from '../types.mts'
import { runConfigDrivenStatementsInTransaction } from './config-driven-statements.mts'
import { runConfigDriven } from './migrations.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

describe('runConfigDriven lock contention handling', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeConfigDrivenDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-config-driven-locking-'))
    testDirs.push(dir)
    return dir
  }

  it('runs injected writer statements in a transaction with a local lock timeout', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(join(folder, '0010-lock-timeout.sql'), 'SELECT 1;')
    const writes: string[] = []

    await runConfigDriven('/unused-root', {
      folder,
      lockTimeoutMs: 1_234,
      writer: makeWriter(writes),
    })

    expect(writes).toEqual([
      '/* runConfigDrivenStatementsInTransaction */ BEGIN',
      "/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '1234ms'",
      '/* runConfigDrivenStatements */ SELECT 1',
      '/* runConfigDrivenStatementsInTransaction */ COMMIT',
    ])
  })

  it('retries config-driven files after a PostgreSQL deadlock', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(join(folder, '0010-deadlock.sql'), 'ALTER TABLE active_table ADD COLUMN x INT;')
    const { errors, logs, retryAttempts, writes } = await runWithSingleRetryableFailure(
      folder,
      '40P01',
    )

    expect(mutationWrites(writes)).toEqual([
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
    ])
    expectTransactionBoundaries(writes, ['BEGIN', 'ROLLBACK', 'BEGIN', 'COMMIT'])
    expect(retryAttempts).toEqual([1])
    expect(errors).toStrictEqual([])
    expect(logs).toStrictEqual(retryLogs('0010-deadlock.sql', '40P01', [2]))
  })

  it('retries config-driven files after a PostgreSQL lock timeout', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(
      join(folder, '0010-lock-timeout.sql'),
      'ALTER TABLE active_table ADD COLUMN x INT;',
    )
    const { errors, logs, retryAttempts, writes } = await runWithSingleRetryableFailure(
      folder,
      '55P03',
    )

    expect(mutationWrites(writes)).toEqual([
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
    ])
    expectTransactionBoundaries(writes, ['BEGIN', 'ROLLBACK', 'BEGIN', 'COMMIT'])
    expect(retryAttempts).toEqual([1])
    expect(errors).toStrictEqual([])
    expect(logs).toStrictEqual(retryLogs('0010-lock-timeout.sql', '55P03', [2]))
  })

  it('logs and rethrows after the config-driven lock retry budget is exhausted', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(
      join(folder, '0010-lock-timeout.sql'),
      'ALTER TABLE active_table ADD COLUMN x INT;',
    )
    const writes: string[] = []
    const errors: unknown[] = []
    const logs: unknown[] = []
    const retryAttempts: number[] = []

    await expect(
      runConfigDriven('/unused-root', {
        folder,
        logger: {
          error: (...args: unknown[]) => {
            errors.push(args)
          },
          log: (...args: unknown[]) => {
            logs.push(args)
          },
        },
        waitForRetry: attempt => {
          retryAttempts.push(attempt)
          return Promise.resolve()
        },
        writer: makeWriter(writes, sql => {
          if (!sql.includes('ALTER TABLE')) return
          throw Object.assign(new Error('lock timeout'), { code: '55P03' })
        }),
      }),
    ).rejects.toThrow('lock timeout')

    expect(mutationWrites(writes)).toStrictEqual([
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
    ])
    expectTransactionBoundaries(writes, [
      'BEGIN',
      'ROLLBACK',
      'BEGIN',
      'ROLLBACK',
      'BEGIN',
      'ROLLBACK',
    ])
    expect(retryAttempts).toEqual([1, 2])
    expect(logs).toStrictEqual(retryLogs('0010-lock-timeout.sql', '55P03', [2, 3]))
    expect(errors).toStrictEqual([
      ['ERROR: running config-driven migration %s failed!', '0010-lock-timeout.sql'],
      ['ALTER TABLE active_table ADD COLUMN x INT;'],
      ['ERROR: running config-driven migration %s failed after SQL dump!', '0010-lock-timeout.sql'],
    ])
  })

  it('does not retry non-retryable config-driven errors', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(join(folder, '0010-fail.sql'), 'ALTER TABLE active_table ADD COLUMN x INT;')
    const writes: string[] = []

    await expect(
      runConfigDriven('/unused-root', {
        folder,
        logger: { error: () => {}, log: () => {} },
        writer: makeWriter(writes, sql => {
          if (!sql.includes('ALTER TABLE')) return
          throw Object.assign(new Error('syntax error'), { code: '42601' })
        }),
      }),
    ).rejects.toThrow('syntax error')

    expect(mutationWrites(writes)).toEqual([
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
    ])
  })
  it('runs constraint validation statements in a separate transaction group', async () => {
    const writes: string[] = []

    await runConfigDrivenStatementsInTransaction(
      `
CREATE TABLE config_validation (id INTEGER);
ALTER TABLE config_validation ADD CONSTRAINT config_validation_id_check CHECK (id >= 0) NOT VALID;
ALTER TABLE config_validation VALIDATE CONSTRAINT config_validation_id_check;
INSERT INTO config_validation (id) VALUES (1);
`,
      makeWriter(writes),
    )

    expect(statementWrites(writes)).toEqual([
      'CREATE TABLE config_validation (id INTEGER)',
      'ALTER TABLE config_validation ADD CONSTRAINT config_validation_id_check CHECK (id >= 0) NOT VALID',
      'ALTER TABLE config_validation VALIDATE CONSTRAINT config_validation_id_check',
      'INSERT INTO config_validation (id) VALUES (1)',
    ])
    expectTransactionBoundaries(writes, ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'COMMIT'])
  })

  it('runs injected-writer constraint validation in its own transaction', async () => {
    const writes: string[] = []

    await runConfigDrivenStatementsInTransaction(
      `
ALTER TABLE example ADD CONSTRAINT example_check CHECK (id >= 0) NOT VALID;
ALTER TABLE example VALIDATE CONSTRAINT example_check;
`,
      makeWriter(writes),
    )

    expect(writes).toEqual([
      '/* runConfigDrivenStatementsInTransaction */ BEGIN',
      "/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '5000ms'",
      '/* runConfigDrivenStatements */ ALTER TABLE example ADD CONSTRAINT example_check CHECK (id >= 0) NOT VALID',
      '/* runConfigDrivenStatementsInTransaction */ COMMIT',
      '/* runConfigDrivenStatementsInTransaction */ BEGIN',
      "/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '5000ms'",
      '/* runConfigDrivenStatements */ ALTER TABLE example VALIDATE CONSTRAINT example_check',
      '/* runConfigDrivenStatementsInTransaction */ COMMIT',
    ])
  })

  it('rounds transaction lock timeout values before sending them to PostgreSQL', async () => {
    const writes: string[] = []

    await runConfigDrivenStatementsInTransaction('SELECT 1;', makeWriter(writes), 1_234.4)

    expect(writes[1]).toBe(
      "/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '1234ms'",
    )
  })
})

async function runWithSingleRetryableFailure(folder: string, code: '40P01' | '55P03') {
  const writes: string[] = []
  const errors: unknown[] = []
  const logs: unknown[] = []
  const retryAttempts: number[] = []
  let attempts = 0

  await runConfigDriven('/unused-root', {
    folder,
    logger: {
      error: (...args: unknown[]) => {
        errors.push(args)
      },
      log: (...args: unknown[]) => {
        logs.push(args)
      },
    },
    waitForRetry: attempt => {
      retryAttempts.push(attempt)
      return Promise.resolve()
    },
    writer: makeWriter(writes, sql => {
      if (!sql.includes('ALTER TABLE')) return
      attempts += 1
      if (attempts === 1) throw Object.assign(new Error('lock contention'), { code })
    }),
  })

  return { errors, logs, retryAttempts, writes }
}
function retryLogs(file: string, code: string, attempts: number[]) {
  return [
    ...attempts.map(attempt => [
      'Config-driven migration %s hit PostgreSQL lock contention (%s); retrying attempt %d of %d.',
      file,
      code,
      attempt,
      3,
    ]),
    ...(attempts.length === 1 ? [['Config-driven migration %s complete!', file]] : []),
  ]
}
function makeWriter(writes: string[], onWrite: (sql: string) => void = () => {}): QueryExecutor {
  return (input: QueryInput): Promise<pg.QueryResult> => {
    const sql = stringFromUnknown(input)
    writes.push(sql)
    onWrite(sql)
    return Promise.resolve(makeQueryResult())
  }
}
function mutationWrites(writes: readonly string[]): string[] {
  return writes.filter(sql => sql.includes('ALTER TABLE'))
}
function expectTransactionBoundaries(writes: readonly string[], expected: string[]) {
  const boundaries = writes
    .filter(sql =>
      /\/\* runConfigDrivenStatementsInTransaction \*\/ (?:BEGIN|COMMIT|ROLLBACK)$/.test(sql),
    )
    .map(sql => sql.split(' ').at(-1))
  expect(boundaries).toEqual(expected)
}
function statementWrites(writes: readonly string[]): string[] {
  return writes
    .filter(sql => sql.startsWith('/* runConfigDrivenStatements */ '))
    .map(sql => sql.slice('/* runConfigDrivenStatements */ '.length))
}
function makeQueryResult(): pg.QueryResult {
  return { command: '', fields: [], oid: 0, rowCount: null, rows: [] }
}
