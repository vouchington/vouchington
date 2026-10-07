import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * What a claimant misuse event is evidence of. Each variant names the one record it hangs off, so
 * a decision can be recorded once and a replay of it adds nothing.
 */
export type ClaimantMisuseEvent =
  | { outcome: 'notice_withdrawn'; submissionId: string }
  | { outcome: 'notice_rejected'; assessmentId: string }
  | {
      outcome: 'restriction_reversed_by_counter_notice' | 'restriction_reversed_by_appeal'
      restrictionId: string
    }

/**
 * Appends claimant misuse evidence (DSA Art. 23, 17 U.S.C. 512(f)) in the decision's own
 * transaction. It runs whatever the automatic-withholding switch says and never suspends anyone:
 * a warned suspension of a notifier stays a moderator action through the ordinary user path.
 */
export async function recordClaimantMisuseEvent(
  transaction: TransactionQuery,
  input: { noticeId: string; event: ClaimantMisuseEvent; recordedAt?: Date },
): Promise<void> {
  const { event } = input
  await transaction(sql`/* recordClaimantMisuseEvent */
    INSERT INTO copyright_claimant_misuse_events (
      copyright_notice_id, outcome, copyright_notice_submission_id,
      copyright_notice_submission_assessment_id, copyright_restriction_id, occurred_at
    ) VALUES (
      ${input.noticeId}, ${event.outcome},
      ${event.outcome === 'notice_withdrawn' ? event.submissionId : null},
      ${event.outcome === 'notice_rejected' ? event.assessmentId : null},
      ${'restrictionId' in event ? event.restrictionId : null},
      ${input.recordedAt ?? new Date()}
    )
    ON CONFLICT DO NOTHING
  `)
}

/** A counter-notice restoration decided for this restriction: the claimant's notice was contested. */
export function recordCounterNoticeRestoration(
  transaction: TransactionQuery,
  input: { noticeId: string; restrictionId: string; now: Date },
): Promise<void> {
  return recordClaimantMisuseEvent(transaction, {
    noticeId: input.noticeId,
    recordedAt: input.now,
    event: {
      outcome: 'restriction_reversed_by_counter_notice',
      restrictionId: input.restrictionId,
    },
  })
}
