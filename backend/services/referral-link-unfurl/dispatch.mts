import { executeHandlerWithCursorInBatches } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueUnfurlReferralLink } from '@queues/unfurl-referral-links/enqueues'

const BATCH_SIZE = 1000

/**
 * Self-heals parents stuck requested-but-not-completed (e.g. a crashed/lost job) by
 * re-enqueueing them, backed by idx_user_referral_program_links__unfurl_requested.
 * Deliberately excludes already-failed parents: a failure is a real, owner-surfaced
 * terminal outcome (not a stuck job), and a fresh unfurl request clears
 * unfurl_failed_at before re-enqueueing (see requestReferralLinkUnfurl) -- so this
 * dispatcher only needs to catch in-flight loss, not retry permanent failures forever.
 */
export async function dispatchUnfurlReferralLinks(): Promise<number> {
  const queryStatement = sql`/* dispatchUnfurlReferralLinks */
    SELECT id
    FROM user_referral_program_links
    WHERE unfurl_requested_at IS NOT NULL
      AND unfurl_completed_at IS NULL
      AND unfurl_failed_at IS NULL
      AND deleted_at IS NULL
    ORDER BY unfurl_requested_at
  `

  let total = 0
  await executeHandlerWithCursorInBatches<{ id: string }>(queryStatement, undefined, {
    batchSize: BATCH_SIZE,
    readOnly: true,
    handler: async rows => {
      total += rows.length
      for (const row of rows) {
        // oxlint-disable-next-line no-await-in-loop -- preserve per-row enqueue backpressure
        await enqueueUnfurlReferralLink({ parentLinkId: row.id })
      }
    },
  })
  return total
}
