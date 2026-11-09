import { beginTransaction, read, registerPostCommitAction } from '@data-stores/psql'
import { withTransactionSavepoint } from '../data-stores/psql/transaction-savepoint.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

async function failOwnedUsernameConstraint(
  scope: TransactionQuery,
  userId: string,
  otherId: string,
) {
  await scope(
    sql`/* writeSavepointPartialFixture */ UPDATE users SET markdown = 'savepoint partial' WHERE id = ${userId}`,
  )
  await scope(sql`/* failSavepointOwnedUniqueConstraint */ UPDATE users SET username = (
    SELECT username FROM users WHERE id = ${otherId}
  ) WHERE id = ${userId}`)
}

/** Fail a real unique constraint after a partial write, then commit caller-owned audit work. */
export async function exerciseTransactionSavepointForTest(
  userId: string,
  otherId: string,
  nested: boolean,
) {
  await using query = await beginTransaction()
  const { rows: initial } = await query<{ markdown: string }>(sql`/* readSavepointInitialFixture */
    SELECT markdown FROM users WHERE id = ${userId}`)
  const applicationError = new Error('outer savepoint operation failed')
  let originalError: unknown
  let thrownError: unknown
  let innerError: unknown
  try {
    await withTransactionSavepoint(query, async scope => {
      if (nested) {
        await scope(
          sql`/* writeOuterSavepointFixture */ UPDATE users SET markdown = 'outer partial' WHERE id = ${userId}`,
        )
        try {
          await withTransactionSavepoint(scope, inner =>
            failOwnedUsernameConstraint(inner, userId, otherId),
          )
        } catch (err) {
          innerError = err
        }
        await scope(
          sql`/* writeAfterNestedSavepointFixture */ UPDATE users SET markdown = 'outer after inner' WHERE id = ${userId}`,
        )
        originalError = applicationError
        throw applicationError
      }
      try {
        await failOwnedUsernameConstraint(scope, userId, otherId)
      } catch (err) {
        originalError = err
        throw err
      }
    })
  } catch (err) {
    thrownError = err
  }
  await query(
    sql`/* commitOuterSavepointAuditFixture */ UPDATE users SET markdown = 'outer audit committed' WHERE id = ${otherId}`,
  )
  await query.commit()
  const { rows } = await read<{
    id: string
    markdown: string
  }>(sql`/* readSavepointCommittedFixture */
    SELECT id, markdown FROM users WHERE id = ANY(${[userId, otherId]}::uuid[]) ORDER BY id`)
  return {
    originalError,
    thrownError,
    innerError,
    initialMarkdown: initial[0]!.markdown,
    userMarkdown: rows.find(row => row.id === userId)!.markdown,
    auditMarkdown: rows.find(row => row.id === otherId)!.markdown,
  }
}

/** Scope hooks follow real SQL savepoints and remain dormant until the owning commit. */
export async function exerciseTransactionSavepointHooksForTest(userId: string, otherId: string) {
  await using query = await beginTransaction()
  const hooks: string[] = []
  registerPostCommitAction(query, async () => {
    hooks.push('outer')
  })
  try {
    await withTransactionSavepoint(query, async scope => {
      registerPostCommitAction(scope, async () => {
        hooks.push('failed SQL scope')
      })
      await failOwnedUsernameConstraint(scope, userId, otherId)
    })
  } catch (err) {
    if (!(err instanceof Error) || !('code' in err) || err.code !== '23505') throw err
  }
  const outerFailure = new Error('discard outer and successful nested hooks')
  try {
    await withTransactionSavepoint(query, async scope => {
      registerPostCommitAction(scope, async () => {
        hooks.push('failed outer scope')
      })
      await withTransactionSavepoint(scope, async inner => {
        registerPostCommitAction(inner, async () => {
          hooks.push('discarded inner')
        })
        await inner(
          sql`/* writeNestedHookFixture */ UPDATE users SET markdown = 'discarded hook write' WHERE id = ${userId}`,
        )
      })
      throw outerFailure
    })
  } catch (err) {
    if (err !== outerFailure) throw err
  }
  await withTransactionSavepoint(query, async scope => {
    registerPostCommitAction(scope, async () => {
      hooks.push('successful scope')
    })
    await withTransactionSavepoint(scope, async inner => {
      registerPostCommitAction(inner, async () => {
        hooks.push('successful inner')
      })
      await inner(
        sql`/* writeSuccessfulHookFixture */ UPDATE users SET markdown = 'committed hook write' WHERE id = ${userId}`,
      )
    })
  })
  const beforeCommit = [...hooks]
  await query.commit()
  return { beforeCommit, afterCommit: hooks }
}
