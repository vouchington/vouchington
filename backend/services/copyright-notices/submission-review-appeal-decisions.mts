import type { TransactionQuery } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightHumanReviewAction } from './types.mts'

type AppealDecision = { restrictionId: string; action: CopyrightHumanReviewAction }

/**
 * Applies every appeal decision to its restriction, then records the immutable review rows, in two
 * statements for the whole decision set. Returns the review ids in decision order.
 */
export async function applyCopyrightAppealDecisions(
  transaction: TransactionQuery,
  input: {
    submissionId: string
    reviewerId: string
    recommendationId: string | null
    manualFallbackReason: string | null
    rationale: string
    reviewedAt: Date
    decisions: readonly AppealDecision[]
  },
): Promise<string[]> {
  const { decisions, submissionId } = input
  if (decisions.length === 0) return []
  const restrictionIds = decisions.map(decision => decision.restrictionId)
  const actions = decisions.map(decision => decision.action)
  await transaction(sql`/* reviewCopyrightAppeal:apply */
    UPDATE copyright_restrictions restriction
    SET human_reviewed_at = COALESCE(restriction.human_reviewed_at, ${input.reviewedAt}),
      human_review_action = COALESCE(
        restriction.human_review_action, decision.action::copyright_restriction_human_review_actions
      ),
      human_reviewed_by_id = CASE WHEN restriction.human_reviewed_at IS NULL THEN ${input.reviewerId}
        ELSE restriction.human_reviewed_by_id END
    FROM unnest(${restrictionIds}::uuid[], ${actions}::text[]) AS decision(restriction_id, action)
    WHERE restriction.id = decision.restriction_id
  `)
  const fallback = input.manualFallbackReason
    ? encryptSecret(input.manualFallbackReason, `copyright-appeal-review-fallback:${submissionId}`)
    : null
  const rationales = decisions.map(decision =>
    encryptSecret(
      input.rationale,
      `copyright-appeal-review:${submissionId}:${decision.restrictionId}`,
    ),
  )
  const { rows } = await transaction<{ id: string; copyright_restriction_id: string }>(sql`
    /* reviewCopyrightAppeal:record */
    INSERT INTO copyright_notice_appeal_reviews (
      copyright_notice_submission_id, copyright_restriction_id,
      copyright_notice_appeal_recommendation_id, reviewed_at, reviewed_by_id, action,
      rationale_ciphertext, manual_fallback_reason_ciphertext
    )
    SELECT ${submissionId}, decision.restriction_id, ${input.recommendationId}, ${input.reviewedAt},
      ${input.reviewerId}, decision.action::copyright_review_actions, decision.rationale_ciphertext,
      ${fallback}
    FROM unnest(${restrictionIds}::uuid[], ${actions}::text[], ${rationales}::text[])
      AS decision(restriction_id, action, rationale_ciphertext)
    RETURNING id, copyright_restriction_id
  `)
  const idByRestriction = new Map(rows.map(row => [row.copyright_restriction_id, row.id]))
  return restrictionIds.map(restrictionId => {
    const id = idByRestriction.get(restrictionId)
    assert(id, 500, 'Copyright appeal review was not recorded')
    return id
  })
}
