import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './entities/users.mts'

/** Cross the real transaction boundary without locking or mutating a shared partition. */
export async function createPartitionFeedbackRetirementFixture(held: boolean) {
  const user = await createTestUser()
  const marker = `feedback-page-${randomUUID()}`
  const readMarkdown = async () => {
    const { rows } = await read<{ markdown: string }>(sql`
      /* readPartitionFeedbackRetirementMarker */
      SELECT markdown FROM users WHERE id = ${user.id}::uuid
    `)
    return rows[0]!.markdown
  }
  const originalMarkdown = await readMarkdown()
  const statements: string[] = []
  const begin: typeof beginTransaction = async () => {
    const transaction = await beginTransaction()
    return new Proxy(transaction, {
      apply(target, thisArgument, argumentsList: Parameters<typeof transaction>) {
        const [input] = argumentsList
        const statement = typeof input === 'string' ? input : input.text
        statements.push(statement)
        if (statement.includes('LOCK TABLE')) return Promise.resolve({ rows: [], rowCount: 0 })
        if (statement.includes('getPartitionDropRefusal:legalHold'))
          return Promise.resolve({ rows: held ? [{ held: 1 }] : [], rowCount: held ? 1 : 0 })
        if (statement.includes('cleanupPartitions:clearFeedbackReferences'))
          return target(sql`/* markPartitionFeedbackRetirementProgress */
            UPDATE users SET markdown = ${marker} WHERE id = ${user.id}::uuid`)
        if (statement.includes('cleanupPartitions:remainingFeedbackReferences'))
          return Promise.resolve({ rows: [{ pending: 1 }], rowCount: 1 })
        if (/\b(?:DETACH|DROP TABLE|ALTER TABLE)\b/u.test(statement))
          throw new Error('Partition DDL must not run in this test')
        return Reflect.apply(target, thisArgument, argumentsList)
      },
    })
  }
  const cleanup = async () => {
    await write(sql`/* restorePartitionFeedbackRetirementMarker */
      UPDATE users SET markdown = ${originalMarkdown} WHERE id = ${user.id}::uuid`)
  }
  return { begin, statements, marker, originalMarkdown, readMarkdown, cleanup }
}
