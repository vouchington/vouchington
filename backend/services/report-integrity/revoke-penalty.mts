import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import { markJwtStale } from '@services/jwt-session/invalidation'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { ReportAbusePenalty } from './get-penalties.mts'

export type RevokeReportAbusePenaltyResult = {
  penalty: ReportAbusePenalty
  penaltyId: string
  userId: string
}

export async function revokeReportAbusePenalty(
  currentUserId: string,
  penaltyId: string,
): Promise<RevokeReportAbusePenaltyResult> {
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* revokeReportAbusePenalty */
      UPDATE report_abuse_penalties
      SET
        revoked_at    = NOW(),
        revoked_by_id = ${currentUserId}
      WHERE id = ${penaltyId}
        AND revoked_at IS NULL
      RETURNING
        id,
        user_id,
        reason,
        source_flag_id,
        created_by_id,
        revoked_at,
        revoked_by_id,
        created_at,
        updated_at
    `)

  const penalty = rows[0] as ReportAbusePenalty | undefined
  if (!penalty) throw createHttpError(404, 'Report abuse penalty not found or already revoked')

  // Serialize the final active-penalty check for this user. Different penalty rows do not
  // conflict with each other, so without this user lock two concurrent revocations could each
  // observe the other's uncommitted penalty as active and both leave the trust stamp behind.
  await query(sql`/* revokeReportAbusePenalty_lockUser */
      SELECT id
      FROM users
      WHERE id = ${penalty.user_id}
      FOR UPDATE
    `)

  const cleared = await query(sql`/* revokeReportAbusePenalty_clearStamp */
      UPDATE users
      SET bad_faith_reporter_at = NULL
      WHERE id = ${penalty.user_id}
        AND bad_faith_reporter_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM report_abuse_penalties
          WHERE user_id = ${penalty.user_id}
            AND revoked_at IS NULL
        )
      RETURNING id
    `)

  const clearedUserId = (cleared.rows[0] as { id: string } | undefined)?.id
  await query.commit()

  // Invalidate the JWT so the trust-tier penalty is lifted on next refresh.
  if (clearedUserId) {
    void markJwtStale(clearedUserId).catch(onError)
  }

  return { penalty, penaltyId: penalty.id, userId: penalty.user_id }
}
