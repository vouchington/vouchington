import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  enqueueUnfurlReferralLink,
  enqueueUnfurlReferralLinksDispatcher,
} from '@queues/unfurl-referral-links/enqueues'

import { getDispatchLimits } from './work-limits.mts'
import type { UnfurlDispatchCursor } from '@queues/unfurl-referral-links/types'
import { getMinUUIDv7ForDate } from '@modules/utils'

/**
 * Self-heals parents stuck requested-but-not-completed (e.g. a crashed/lost job) by
 * re-enqueueing them, backed by idx_user_referral_program_links__unfurl_requested.
 * Deliberately excludes already-failed parents: a failure is a real, owner-surfaced
 * terminal outcome (not a stuck job), and a fresh unfurl request clears
 * unfurl_failed_at before re-enqueueing (see requestReferralLinkUnfurl) -- so this
 * dispatcher only needs to catch in-flight loss, not retry permanent failures forever.
 */
export async function dispatchUnfurlReferralLinks(cursor?: UnfurlDispatchCursor) {
  const limits = getDispatchLimits()
  const sweepStartedAt = cursor?.sweepStartedAt ?? new Date().toISOString()
  const upperId = getMinUUIDv7ForDate(new Date(sweepStartedAt))
  const queryStatement = sql`/* dispatchUnfurlReferralLinks */
    SELECT id
    FROM user_referral_program_links
    WHERE id < ${upperId}::uuid
      AND (${cursor?.afterId ?? null}::uuid IS NULL OR id > ${cursor?.afterId ?? null}::uuid)
      AND unfurl_requested_at <= ${sweepStartedAt}::timestamptz
      AND unfurl_completed_at IS NULL
      AND unfurl_failed_at IS NULL
      AND deleted_at IS NULL
    ORDER BY id
  `

  let total = 0
  const result = await executeHandlerWithCursorInBatches<{ id: string }>(
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
        }
      },
    },
  )
  if (result.hasMore && result.lastRow)
    await enqueueUnfurlReferralLinksDispatcher({ sweepStartedAt, afterId: result.lastRow.id })
  return { count: total, hasMore: result.hasMore }
}
