import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type CopyrightEmailCorrespondenceKind =
  | 'supplement'
  | 'appeal'
  | 'counter_notice'
  | 'withdrawal'
  | 'court_or_ccb_hold'
  | 'complaint'

export type CopyrightEmailAppealSubmission = {
  reason: string
  targetIds: string[]
}

export type CopyrightEmailCounterNoticeSubmission = {
  name: string
  address: string
  telephone: string
  consentToFederalJurisdiction: boolean
  consentToServiceOfProcess: boolean
  goodFaithMisidentificationUnderPenaltyOfPerjury: boolean
  electronicSignature: string
  targetIds: string[]
}

export type CopyrightEmailOtherSubmission = {
  summary: string
}

export async function assertNoInitialIntakeReview(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* copyrightEmailIntake:noInitialReview */
    SELECT 1 FROM copyright_notice_email_intake_receipts
    WHERE id = ${intakeId} AND review_decision IS NOT NULL
  `)
  assert(!rows[0], 409, 'Thread-linked copyright email cannot receive an initial intake review')
}

export async function assertRecommendationScope(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  intakeId: string,
  recommendationId: string | null,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction(sql`/* reviewCopyrightEmailCorrespondence:recommendation */
    SELECT id FROM copyright_notice_email_intake_recommendation_identities
    WHERE id = ${recommendationId} AND copyright_notice_email_intake_receipt_id = ${intakeId}
  `)
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}

export function assertRecommendationOrFallback(
  recommendationId: string | null,
  manualFallbackReason: string | null,
): void {
  assert(
    (recommendationId === null) !== (manualFallbackReason === null),
    422,
    'Provide either recommendation_id or manual_fallback_reason',
  )
  if (manualFallbackReason !== null)
    assert(
      manualFallbackReason.trim() && manualFallbackReason.length <= 10_000,
      422,
      'Invalid manual fallback reason',
    )
}
