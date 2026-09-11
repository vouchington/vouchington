import sql from 'sql-template-strings'
import { withUserDeletionTransaction } from './delete-phase-transaction.mts'

export async function processUserDeletionAccountDataBatch(
  userId: string,
  requestId: string,
  batchSize: number,
) {
  return withUserDeletionTransaction(userId, async query => {
    const referrals = await query(sql`/* processUserDeletionAccountData:referrals */
      WITH candidates AS (
        SELECT id FROM session_referral_attributions
        WHERE user_id = ${userId} ORDER BY id LIMIT ${batchSize} FOR UPDATE
      )
      UPDATE session_referral_attributions SET user_id = NULL
      FROM candidates WHERE session_referral_attributions.id = candidates.id
    `)
    if ((referrals.rowCount ?? 0) > 0) return { hasMore: true }

    const attempts = await query(sql`/* processUserDeletionAccountData:exportAttempts */
      WITH candidates AS (
        SELECT attempt.request_id, attempt.processing_attempt_id
        FROM user_data_request_attempts attempt
        JOIN user_data_requests request ON request.id = attempt.request_id
        WHERE request.user_id = ${userId}
          AND (
            attempt.upload_lease_expires_at IS NULL
            OR attempt.upload_lease_expires_at <= CURRENT_TIMESTAMP
          )
        ORDER BY attempt.request_id, attempt.processing_attempt_id
        LIMIT ${batchSize}
        FOR UPDATE OF attempt
      ), recorded AS (
        INSERT INTO user_deletion_external_works (request_id, work_kind, work_key)
        SELECT ${requestId}::uuid AS request_id,
          's3-export' AS work_kind,
          candidates.request_id::text || '/' || candidates.processing_attempt_id::text || '.zip' AS work_key
        FROM candidates
        ORDER BY request_id ASC NULLS LAST, work_kind ASC NULLS LAST, work_key ASC NULLS LAST
        ON CONFLICT (request_id, work_kind, work_key) DO NOTHING
      )
      DELETE FROM user_data_request_attempts attempt
      USING candidates
      WHERE attempt.request_id = candidates.request_id
        AND attempt.processing_attempt_id = candidates.processing_attempt_id
    `)
    if ((attempts.rowCount ?? 0) > 0) return { hasMore: true }

    const { rows: blockedAttempts } = await query<{ retry_after_ms: number }>(
      sql`/* processUserDeletionAccountData:blockedAttempts */
      SELECT CEIL(EXTRACT(EPOCH FROM (
          MIN(attempt.upload_lease_expires_at) - CURRENT_TIMESTAMP
        )) * 1000)::int AS retry_after_ms
      FROM user_data_request_attempts attempt
      JOIN user_data_requests request ON request.id = attempt.request_id
      WHERE request.user_id = ${userId}
        AND attempt.upload_lease_expires_at > CURRENT_TIMESTAMP
      HAVING COUNT(*) > 0
    `,
    )
    const retryAfterMs = blockedAttempts[0]?.retry_after_ms
    if (retryAfterMs) return { hasMore: true, retryAfterMs: Math.max(1_000, retryAfterMs) }

    const { rows: requests } = await query<{
      id: string
      s3_key: string | null
    }>(sql`/* processUserDeletionAccountData:exports */
      SELECT id, s3_key FROM user_data_requests
      WHERE user_id = ${userId}
        AND (
          (completed_at IS NULL AND failed_at IS NULL)
          OR (completed_at IS NOT NULL AND failed_at IS NULL AND s3_key IS NOT NULL)
        )
      ORDER BY id LIMIT ${batchSize} FOR UPDATE
    `)
    if (requests.length > 0) {
      const s3Keys = requests.flatMap(row => (row.s3_key ? [row.s3_key] : []))
      if (s3Keys.length > 0) {
        await query(sql`/* processUserDeletionAccountData:recordS3 */
          INSERT INTO user_deletion_external_works (request_id, work_kind, work_key)
          SELECT ${requestId}::uuid AS request_id, 's3-export' AS work_kind, key AS work_key
          FROM UNNEST(${s3Keys}::text[]) AS key
          ORDER BY request_id ASC NULLS LAST, work_kind ASC NULLS LAST, work_key ASC NULLS LAST
          ON CONFLICT (request_id, work_kind, work_key) DO NOTHING
        `)
      }
      await query(sql`/* processUserDeletionAccountData:expireExports */
        UPDATE user_data_requests
        SET failed_at = CASE
              WHEN completed_at IS NULL THEN COALESCE(failed_at, CURRENT_TIMESTAMP)
              ELSE failed_at
            END,
            expires_at = CASE
              WHEN completed_at IS NOT NULL
                THEN LEAST(COALESCE(expires_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
              ELSE expires_at
            END,
            s3_key = NULL
        WHERE id = ANY(${requests.map(row => row.id)}::uuid[])
      `)
      return { hasMore: true }
    }

    const stripeWork = await query(sql`/* processUserDeletionAccountData:stripe */
      INSERT INTO user_deletion_external_works (request_id, work_kind, work_key)
      SELECT ${requestId}::uuid AS request_id,
        'stripe-customer' AS work_kind,
        lineage.provider_account_id AS work_key
      FROM membership_sources source
      JOIN membership_provider_lineages lineage
        ON lineage.id = source.membership_provider_lineage_id
      WHERE source.user_id = ${userId}
        AND source.source_kind = 'direct'
        AND lineage.provider = 'stripe'
        AND lineage.provider_account_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_deletion_external_works work
          WHERE work.request_id = ${requestId}
            AND work.work_kind = 'stripe-customer'
            AND work.work_key = lineage.provider_account_id
        )
      ORDER BY request_id ASC NULLS LAST, work_kind ASC NULLS LAST, work_key ASC NULLS LAST
      LIMIT ${batchSize}
      ON CONFLICT (request_id, work_kind, work_key) DO NOTHING
    `)
    return { hasMore: (stripeWork.rowCount ?? 0) > 0 }
  })
}
