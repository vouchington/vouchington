import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'

import type { QueryExecutor, QueryInput } from '../types.mts'
import { write, writePool } from '../index.mts'
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

  it('sends a local lock timeout before injected writer statements', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(join(folder, '0010-lock-timeout.sql'), 'SELECT 1;')
    const writes: string[] = []

    await runConfigDriven('/unused-root', {
      folder,
      lockTimeoutMs: 1_234,
      writer: makeWriter(writes),
    })

    expect(writes).toEqual([
      "/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '1234ms'",
      '/* runConfigDrivenStatements */ SELECT 1',
    ])
  })

  it('retries config-driven files after a PostgreSQL deadlock', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(join(folder, '0010-deadlock.sql'), 'ALTER TABLE active_table ADD COLUMN x INT;')
    const { errors, logs, writes } = await runWithSingleRetryableFailure(folder, '40P01')

    expect(mutationWrites(writes)).toEqual([
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
    ])
    expect(errors).toStrictEqual([])
    expect(logs).toStrictEqual([
      [
        'Config-driven migration %s hit PostgreSQL lock contention (%s); retrying attempt %d of %d.',
        '0010-deadlock.sql',
        '40P01',
        2,
        3,
      ],
      ['Config-driven migration %s complete!', '0010-deadlock.sql'],
    ])
  })

  it('retries config-driven files after a PostgreSQL lock timeout', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(
      join(folder, '0010-lock-timeout.sql'),
      'ALTER TABLE active_table ADD COLUMN x INT;',
    )
    const { errors, logs, writes } = await runWithSingleRetryableFailure(folder, '55P03')

    expect(mutationWrites(writes)).toEqual([
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
      '/* runConfigDrivenStatements */ ALTER TABLE active_table ADD COLUMN x INT',
    ])
    expect(errors).toStrictEqual([])
    expect(logs).toStrictEqual([
      [
        'Config-driven migration %s hit PostgreSQL lock contention (%s); retrying attempt %d of %d.',
        '0010-lock-timeout.sql',
        '55P03',
        2,
        3,
      ],
      ['Config-driven migration %s complete!', '0010-lock-timeout.sql'],
    ])
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
    expect(logs).toStrictEqual([
      [
        'Config-driven migration %s hit PostgreSQL lock contention (%s); retrying attempt %d of %d.',
        '0010-lock-timeout.sql',
        '55P03',
        2,
        3,
      ],
      [
        'Config-driven migration %s hit PostgreSQL lock contention (%s); retrying attempt %d of %d.',
        '0010-lock-timeout.sql',
        '55P03',
        3,
        3,
      ],
    ])
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
  it('commits constraint validation separately from the statements before it', async () => {
    // Short prefix keeps this within PostgreSQL's 63-byte identifier limit (a longer prefix
    // silently truncates on write, so the exact-match `conname = $1` lookup below finds nothing).
    const table = `cfg_validate_${randomUUID().replaceAll('-', '')}`
    const log = `${table}_tx`
    const constraint = `${table}_id_check`
    const client = await writePool.connect()

    try {
      await runConfigDrivenStatementsInTransaction(
        `
CREATE TABLE ${table} (id INTEGER);
CREATE TABLE ${log} (step INTEGER, txid TEXT);
INSERT INTO ${log} (step, txid) VALUES (1, txid_current()::text);
ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (id >= 0) NOT VALID;
ALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};
INSERT INTO ${log} (step, txid) VALUES (2, txid_current()::text);
`,
        undefined,
        5_000,
        client,
      )

      // One transaction would give both inserts the same transaction id and would leave the
      // constraint unvalidated if that transaction later rolled back.
      const { rows } = await write<{ step: number; txid: string }>(
        `/* config-driven-statements.test */ SELECT step, txid FROM ${log} ORDER BY step`,
      )
      expect(rows.map(row => row.step)).toEqual([1, 2])
      expect(rows[0]?.txid).not.toBe(rows[1]?.txid)
      const validated = await write<{ convalidated: boolean }>(
        '/* config-driven-statements.test */ SELECT convalidated FROM pg_constraint WHERE conname = $1',
        [constraint],
      )
      expect(validated.rows).toEqual([{ convalidated: true }])
      await expect(write(`INSERT INTO ${table} (id) VALUES (-1)`)).rejects.toThrow(
        /violates check constraint/,
      )
    } finally {
      client.release()
      await write(`DROP TABLE IF EXISTS ${log}`)
      await write(`DROP TABLE IF EXISTS ${table}`)
    }
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
      "/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '5000ms'",
      '/* runConfigDrivenStatements */ ALTER TABLE example ADD CONSTRAINT example_check CHECK (id >= 0) NOT VALID',
      "/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '5000ms'",
      '/* runConfigDrivenStatements */ ALTER TABLE example VALIDATE CONSTRAINT example_check',
    ])
  })

  it('rounds transaction lock timeout values before sending them to PostgreSQL', async () => {
    await expect(
      runConfigDrivenStatementsInTransaction('SELECT 1;', undefined, 1_234.4),
    ).resolves.toBeUndefined()
  })
})

async function runWithSingleRetryableFailure(folder: string, code: '40P01' | '55P03') {
  const writes: string[] = []
  const errors: unknown[] = []
  const logs: unknown[] = []
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
    writer: makeWriter(writes, sql => {
      if (!sql.includes('ALTER TABLE')) return
      attempts += 1
      if (attempts === 1) {
        throw Object.assign(new Error('lock contention'), { code })
      }
    }),
  })

  return { errors, logs, writes }
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

function makeQueryResult(): pg.QueryResult {
  return {
    command: '',
    fields: [],
    oid: 0,
    rowCount: null,
    rows: [],
  }
}
