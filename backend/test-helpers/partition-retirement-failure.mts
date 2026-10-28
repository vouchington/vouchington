import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { createTestUser } from './entities/users.mts'
import { rejectQuery } from './injected-failures.mts'

/** Fail before taking a shared table lock, after an owned write that must roll back. */
export async function createPartitionRetirementFailureFixture() {
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
          return statement.startsWith('/* cleanupPartitions:lockParent */')
        },
        'partition retirement lock rejected for test',
      )
    } catch (err) {
      await transaction[Symbol.asyncDispose]()
      throw err
    }
  }
  return { begin, statements, originalMarkdown, readMarkdown }
}
