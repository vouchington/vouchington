import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'

import type { QueryExecutor, QueryInput } from '../types.mts'
import { runConfigDriven } from './migrations.mts'

describe('runConfigDriven', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeConfigDrivenDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-config-driven-'))
    testDirs.push(dir)
    return dir
  }

  it('runs config-driven files in sorted order with the options-object signature', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(join(folder, '0020-second.sql'), 'SELECT 2;')
    await writeFile(join(folder, '0010-first.sql'), 'SELECT 1;')
    const writes: string[] = []
    const logs: string[] = []

    await runConfigDriven('/unused-root', {
      folder,
      logger: {
        error: () => {},
        log: (...args: unknown[]) => {
          logs.push(args.join(' '))
        },
      },
      writer: makeWriter(writes),
    })

    expect(writes).toEqual([...transactionWrites('SELECT 1'), ...transactionWrites('SELECT 2')])
    expect(logs).toEqual([
      'Config-driven migration %s complete! 0010-first.sql',
      'Config-driven migration %s complete! 0020-second.sql',
    ])
  })

  it('runs statements inside each config-driven file one at a time', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(
      join(folder, '0010-statements.sql'),
      `
SELECT ';';
DO $$ BEGIN
  RAISE NOTICE 'still; one statement';
END $$;
SELECT 3;
`,
    )
    const writes: string[] = []

    await runConfigDriven('/unused-root', {
      folder,
      writer: makeWriter(writes),
    })

    expect(writes).toEqual(
      transactionWrites(
        "SELECT ';'",
        "DO $$ BEGIN\n  RAISE NOTICE 'still; one statement';\nEND $$",
        'SELECT 3',
      ),
    )
  })

  it('runs split config-driven file statements in one transaction on one client', async () => {
    const folder = await makeConfigDrivenDir()
    const suffix = randomUUID().replaceAll('-', '')
    await writeFile(
      join(folder, '0010-session-state.sql'),
      `
CREATE TEMP TABLE config_driven_session_${suffix} (id INTEGER) ON COMMIT DROP;
INSERT INTO config_driven_session_${suffix} (id) VALUES (1);
SELECT id FROM config_driven_session_${suffix};
`,
    )

    await expect(runConfigDriven('/unused-root', { folder })).resolves.toBeUndefined()
  })

  it('logs and rethrows config-driven migration failures', async () => {
    const folder = await makeConfigDrivenDir()
    await writeFile(join(folder, '0010-fail.sql'), 'SELECT broken;')
    const errors: unknown[] = []
    const writes: string[] = []

    await expect(
      runConfigDriven('/unused-root', {
        folder,
        logger: {
          error: (...args: unknown[]) => {
            errors.push(args)
          },
          log: () => {},
        },
        writer: makeWriter(writes, sql => {
          if (sql.includes('SELECT broken')) throw new Error('syntax error')
        }),
      }),
    ).rejects.toThrow('syntax error')

    expect(errors).toEqual([
      ['ERROR: running config-driven migration %s failed!', '0010-fail.sql'],
      ['SELECT broken;'],
      ['ERROR: running config-driven migration %s failed after SQL dump!', '0010-fail.sql'],
    ])
    expect(writes.at(-1)).toBe('/* runConfigDrivenStatementsInTransaction */ ROLLBACK')
  })
})

function makeWriter(writes: string[], onWrite: (sql: string) => void = () => {}): QueryExecutor {
  return (input: QueryInput): Promise<pg.QueryResult> => {
    const sql = String(input)
    writes.push(sql)
    onWrite(sql)
    return Promise.resolve({
      command: '',
      fields: [],
      oid: 0,
      rowCount: null,
      rows: [],
    })
  }
}

function transactionWrites(...statements: string[]): string[] {
  return [
    '/* runConfigDrivenStatementsInTransaction */ BEGIN',
    "/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '5000ms'",
    ...statements.map(statement => `/* runConfigDrivenStatements */ ${statement}`),
    '/* runConfigDrivenStatementsInTransaction */ COMMIT',
  ]
}
