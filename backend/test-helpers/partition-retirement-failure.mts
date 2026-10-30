import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import { createTestUser } from './entities/users.mts'
import { rejectQuery } from './injected-failures.mts'

/** Fail before taking a shared table lock, after an owned write that must roll back. */
export async function createPartitionRetirementFailureFixture(
  options: {
    lockStatementPrefix?: string
    failure?: Error
  } = {},
) {
  const user = await createTestUser()
  const statements: string[] = []
  const readMarkdown = async () => {
    const { rows } = await write<{ markdown: string }>(
      '/* readPartitionRetirementFailureMarkdown */ SELECT markdown FROM users WHERE id = $1',
      [user.id],
    )
    return rows[0]!.markdown
  }
  const originalMarkdown = await readMarkdown()
  const begin: typeof beginTransaction = async () => {
    const transaction = await beginTransaction()
    try {
      const marker = `partition retirement ${randomUUID()}`
      const { rows } = await transaction<{ markdown: string }>(
        '/* stagePartitionRetirementFailureMarkdown */ UPDATE users SET markdown = $2 WHERE id = $1 RETURNING markdown',
        [user.id, marker],
      )
      assert.equal(rows[0]?.markdown, marker)
      return rejectQuery(
        transaction,
        statement => {
          statements.push(statement)
          return statement.startsWith(
            options.lockStatementPrefix ?? '/* cleanupPartitions:lockParent */',
          )
        },
        options.failure ?? 'partition retirement lock rejected for test',
      )
    } catch (err) {
      await transaction[Symbol.asyncDispose]()
      throw err
    }
  }
  return { begin, statements, originalMarkdown, readMarkdown }
}

/** Record operator DDL routing while owning only an otherwise empty real transaction. */
export function createCopyrightPartitionRetirementRecorder(
  tables: readonly string[],
  suffixes: readonly string[] = ['2020_02'],
) {
  const statements: string[] = []
  const query: QueryExecutor = async input => {
    statements.push(typeof input === 'string' ? input : input.text)
    return {
      rows: tables.flatMap(table =>
        suffixes.map(suffix => ({
          parent_table: table,
          partition_table: `${table}__p_${suffix}`,
        })),
      ) as never[],
      rowCount: tables.length * suffixes.length,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }
  }
  const begin: typeof beginTransaction = async () => {
    const transaction = await beginTransaction()
    const record: QueryExecutor = async input => {
      const statement = typeof input === 'string' ? input : input.text
      statements.push(statement)
      // The fake children are empty. The scalar report probe still returns one covered row.
      const rows = statement.includes('/* copyrightHistoryReportIsCovered */')
        ? [{ first_at: null, last_at: null, max_generation: null, covered: true }]
        : []
      return {
        rows: rows as never[],
        rowCount: rows.length,
        command: rows.length ? 'SELECT' : 'ALTER',
        oid: 0,
        fields: [],
      }
    }
    return Object.assign(record, {
      client: transaction.client,
      commit: () => transaction.commit(),
      rollback: () => transaction.rollback(),
      [Symbol.asyncDispose]: () => transaction[Symbol.asyncDispose](),
    })
  }
  return { query, begin, statements }
}
