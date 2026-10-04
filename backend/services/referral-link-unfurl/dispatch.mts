import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueUnfurlReferralLink } from '@queues/unfurl-referral-links/enqueues'

import { getDispatchLimits } from './work-limits.mts'
import type { UnfurlDispatchCursor } from '@queues/unfurl-referral-links/types'

/**
 * Self-heals parents stuck requested-but-not-completed (e.g. a crashed/lost job) by
 * re-enqueueing them, backed by idx_user_referral_program_links__unfurl_requested.
 * Deliberately excludes already-failed parents: a failure is a real, owner-surfaced
 * terminal outcome (not a stuck job), and a fresh unfurl request clears
 * unfurl_failed_at before re-enqueueing (see requestReferralLinkUnfurl) -- so this
 * dispatcher only needs to catch in-flight loss, not retry permanent failures forever.
 */
export async function dispatchUnfurlReferralLinks(
  cursor?: UnfurlDispatchCursor,
  saveProgress?: (cursor: UnfurlDispatchCursor) => Promise<void>,
) {
  const limits = getDispatchLimits()
  const sweepStartedAt = cursor?.sweepStartedAt ?? new Date().toISOString()
  await saveProgress?.({ sweepStartedAt, ...(cursor?.after && { after: cursor.after }) })
  const queryStatement = sql`/* dispatchUnfurlReferralLinks */
    SELECT id, unfurl_requested_at::text AS requested_at
    FROM user_referral_program_links
    WHERE unfurl_requested_at <= ${sweepStartedAt}::timestamptz
      AND unfurl_completed_at IS NULL
      AND unfurl_failed_at IS NULL
      AND deleted_at IS NULL
  `

  if (cursor?.after)
    queryStatement.append(
      sql` AND (unfurl_requested_at, id) > (${cursor.after.requestedAt}::timestamptz, ${cursor.after.id}::uuid)`,
    )
  queryStatement.append(' ORDER BY unfurl_requested_at, id')

  let total = 0
  const result = await executeHandlerWithCursorInBatches<{ id: string; requested_at: string }>(
    queryStatement,
    undefined,
    {
      batchSize: limits.batchSize,
      maxRows: limits.maxRows,
      readOnly: true,
      handler: async rows => {
        total += rows.length
        for (const row of rows) {
          // oxlint-disable-next-line no-await-in-loop -- preserve per-row enqueue backpressure
          await enqueueUnfurlReferralLink({ parentLinkId: row.id })
          // oxlint-disable-next-line no-await-in-loop -- save only successfully enqueued predecessors
          await saveProgress?.({
            sweepStartedAt,
            after: { requestedAt: row.requested_at, id: row.id },
          })
        }
      },
    },
  )
  return { count: total, hasMore: result.hasMore }
}
