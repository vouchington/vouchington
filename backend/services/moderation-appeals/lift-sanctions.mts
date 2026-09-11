import { beginTransaction, withTransactionOptions, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  lockAuthorPublicationLifecycle,
  recordPostPublicationChange,
} from '@services/post-publication'

export async function lockSuspensionAppealAuthorLifecycle(
  query: TransactionQuery,
  appealId: string,
): Promise<void> {
  const { rows } = await query<{ user_id: string }>(sql`/* lockSuspensionAppealAuthorLifecycle */
    SELECT user_suspensions.user_id
    FROM moderation_appeals
    JOIN user_suspensions ON user_suspensions.id = moderation_appeals.user_suspension_id
    WHERE moderation_appeals.id = ${appealId}
      AND moderation_appeals.sent_at IS NOT NULL
      AND moderation_appeals.resolved_at IS NULL
    LIMIT 1
  `)
  const suspension = rows[0]
  if (suspension) await lockAuthorPublicationLifecycle(query, suspension.user_id)
}

// Appeal-level authorization permits lifting the target ban without a community-role check.
export async function liftCommunityBanById(
  staffUserId: string,
  banId: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* liftCommunityBanById:appealAccept */
    UPDATE community_bans
    SET lifted_at = CURRENT_TIMESTAMP, lifted_by_id = ${staffUserId}
    WHERE id = ${banId} AND lifted_at IS NULL
  `,
    options,
  )
}

export async function liftUserSuspensionById(
  staffUserId: string,
  suspensionId: string,
  options: QueryOptions,
): Promise<void> {
  const run = async (query: TransactionQuery): Promise<void> => {
    const { rows: targets } = await query<{ user_id: string }>(
      sql`/* liftUserSuspensionById:resolveAuthor */
      SELECT user_id
      FROM user_suspensions
      WHERE id = ${suspensionId}
      LIMIT 1`,
    )
    const target = targets[0]
    if (!target) return

    await lockAuthorPublicationLifecycle(query, target.user_id)

    const { rows } = await query<{ user_id: string }>(
      sql`/* liftUserSuspensionById:appealAccept */
      UPDATE user_suspensions
      SET lifted_at = CURRENT_TIMESTAMP, lifted_by_id = ${staffUserId}
      WHERE id = ${suspensionId} AND lifted_at IS NULL
      RETURNING user_id`,
    )
    const suspension = rows[0]
    if (suspension) {
      await recordPostPublicationChange(query, {
        scope: { type: 'author', authorUserId: suspension.user_id },
        reason: 'author_suspension_changed',
        footprint: { priorAuthorUserId: suspension.user_id },
      })
    }
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  await run(transaction)
  await transaction.commit()
}
