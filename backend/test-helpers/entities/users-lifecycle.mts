import { writeTestImageOwnerRetirement } from '../image-owner-retirement.mts'
import { read, type TransactionQuery, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function softDeleteUser(userId: string): Promise<void> {
  await using query = await beginTransaction()
  await writeTestImageOwnerRetirement(query, { userId }, async scopeQuery => {
    await scopeQuery(
      sql`/* softDeleteUser */
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
  `,
    )
  })
  await query.commit()
}

export async function softDeleteUserDaysAgo(userId: string, daysAgo: number): Promise<void> {
  await using query = await beginTransaction()
  await writeTestImageOwnerRetirement(query, { userId }, async scopeQuery => {
    await scopeQuery(
      sql`/* softDeleteUserDaysAgo */
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP - make_interval(days => ${daysAgo})
    WHERE id = ${userId}
  `,
    )
  })
  await query.commit()
}

export async function softDeleteUserAt(userId: string, deletedAt: Date): Promise<void> {
  await using query = await beginTransaction()
  await writeTestImageOwnerRetirement(query, { userId }, async scopeQuery => {
    await scopeQuery(
      sql`/* softDeleteUserAt */
    UPDATE users
    SET deleted_at = ${deletedAt}
    WHERE id = ${userId}
  `,
    )
  })
  await query.commit()
}

export async function restoreUser(userId: string): Promise<void> {
  await write(
    sql`/* restoreUser */
    UPDATE users
    SET deleted_at = NULL
    WHERE id = ${userId}
  `,
  )
}

export async function hardDeleteTestUser(userId: string): Promise<void> {
  await write(sql`/* hardDeleteTestUser */ DELETE FROM users WHERE id = ${userId}`)
}

export async function hardDeleteTestUserWithLockTimeout(
  userId: string,
  lockTimeout = '50ms',
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* hardDeleteTestUserWithLockTimeout */
        SELECT set_config('lock_timeout', ${lockTimeout}, TRUE)
      `)
    await query(sql`/* hardDeleteTestUserWithLockTimeout */ DELETE FROM users WHERE id = ${userId}`)
    await transaction.commit()
  }
}

export async function setTestUserVoteWeight(userId: string, voteWeight: number): Promise<void> {
  await write(sql`/* setTestUserVoteWeight */
    UPDATE users SET vote_weight = ${voteWeight} WHERE id = ${userId}
  `)
}

export async function softDeleteTestUserAndWaitBeforeCommit(
  userId: string,
  waitBeforeCommit: Promise<void>,
  afterDelete?: () => void,
  beforeDelete?: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await beforeDelete?.(query)
    await writeTestImageOwnerRetirement(query, { userId }, scopeQuery =>
      scopeQuery(sql`/* softDeleteTestUserAndWaitBeforeCommit */
        UPDATE users
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}
      `),
    )
    afterDelete?.()
    await waitBeforeCommit
    await transaction.commit()
  }
}

export async function hardDeleteTestUserAndWaitBeforeCommit(
  userId: string,
  waitBeforeCommit: Promise<void>,
  afterDelete?: () => void,
  beforeDelete?: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await beforeDelete?.(query)
    await query(sql`/* hardDeleteTestUserAndWaitBeforeCommit */
        DELETE FROM users
        WHERE id = ${userId}
      `)
    afterDelete?.()
    await waitBeforeCommit
    await transaction.commit()
  }
}

export async function getTestUserRaw(userId: string): Promise<{
  id: string
  username: string | null
  markdown: string
  deleted_at: Date | null
  platform_account_kind: 'official' | 'system' | null
  vote_weight_recalculated_at: Date | null
} | null> {
  const { rows } = await read(
    sql`/* getTestUserRaw */
    SELECT id, username, markdown, deleted_at, platform_account_kind, vote_weight_recalculated_at
    FROM users
    WHERE id = ${userId}
  `,
  )
  return (
    (rows[0] as {
      id: string
      username: string | null
      markdown: string
      deleted_at: Date | null
      platform_account_kind: 'official' | 'system' | null
      vote_weight_recalculated_at: Date | null
    }) ?? null
  )
}

export async function setTestUserVoteWeightRecalculatedAt(
  userId: string,
  recalculatedAt: Date,
): Promise<void> {
  await write(sql`/* setTestUserVoteWeightRecalculatedAt */
    UPDATE users
    SET vote_weight_recalculated_at = ${recalculatedAt}
    WHERE id = ${userId}
  `)
}

export {
  suspendTestUser,
  suspendTestUserGetId,
  lockTestUserSuspension,
  getTestUserSuspension,
  unsuspendTestUser,
} from './users-suspensions.mts'

export { clearMfaForUser, setUserMarkdown } from './users-test-account-state.mts'
