import {
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
  write,
} from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { enqueueRecordedMembershipPauseCollectionBestEffort } from '@services/memberships/pause-collection/enqueue-recorded'
import { recordMembershipPauseCollectionWork } from '@services/memberships/pause-collection/record'
import { recordPostPublicationChange } from '@services/post-publication'

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
      await recordMembershipPauseCollectionWork(query, suspension.user_id)
      registerPostCommitAction(query, () =>
        enqueueRecordedMembershipPauseCollectionBestEffort(suspension.user_id),
      )
    }
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  await run(transaction)
  await transaction.commit()
}
