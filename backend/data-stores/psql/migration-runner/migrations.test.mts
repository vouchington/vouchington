import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type pg from 'pg'
import { describe, expect, it } from 'vitest'

import type { QueryExecutor, QueryInput } from '../types.mts'
import { getFilesFromFolder, readMigrationFile } from './files.mts'
import { readCanonicalConfigDrivenGenerator } from './config-driven-generators.mts'
import { runConfigDriven } from './migrations.mts'
import { splitSqlStatements } from './sql-statements.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

describe('runConfigDriven', () => {
  it('rejects an unregistered canonical generator before loading it', async () => {
    await expect(readCanonicalConfigDrivenGenerator('unregistered-generator.mts')).rejects.toThrow(
      'Unregistered config-driven generator: unregistered-generator.mts',
    )
  })

  it('runs canonical generators in filename order with unchanged SQL statements', async () => {
    const rootDir = fileURLToPath(new URL('..', import.meta.url))
    const folder = join(rootDir, 'config-driven')
    const files = getFilesFromFolder(folder)
    const writes: string[] = []
    const logs: unknown[][] = []

    await runConfigDriven(rootDir, {
      writer: makeWriter(writes),
      logger: {
        error: () => {},
        log: (...args: unknown[]) => {
          logs.push(args)
        },
      },
    })

    const expectedStatements: string[] = []
    for (const file of files) {
      expectedStatements.push(...splitSqlStatements(await readMigrationFile(folder, file)))
    }
    const statementPrefix = '/* runConfigDrivenStatements */ '
    const statements = writes
      .filter(write => write.startsWith(statementPrefix))
      .map(write => write.slice(statementPrefix.length))

    expect(logs).toEqual(files.map(file => ['Config-driven migration %s complete!', file]))
    expect(statements).toEqual(expectedStatements)
  })
})

function makeWriter(writes: string[], onWrite: (sql: string) => void = () => {}): QueryExecutor {
  return (input: QueryInput): Promise<pg.QueryResult> => {
    const sql = stringFromUnknown(input)
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
