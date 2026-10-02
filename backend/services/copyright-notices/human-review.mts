import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { getImagePlacementKey } from '@services/images/placements'
import type { CopyrightHumanReviewAction, CopyrightRestrictionRecord } from './types.mts'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import { createCopyrightRestoreIntentForReversalInTransaction } from './restoration-reversal.mts'
import {
  applyCopyrightConfirmationConsequencesInTransaction,
  enqueueCopyrightStaydownHashes,
} from './staydown-registration.mts'

export async function completeCopyrightMandatoryHumanReview(input: {
  currentUser: PrivateUser
  noticeId: string
  restrictionId: string
  action: CopyrightHumanReviewAction
  rationale: string
  reviewedAt: Date
}): Promise<CopyrightRestrictionRecord> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim() && input.rationale.length <= 10_000, 422, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: placementRows } = await transaction<{ placement_id: string }>(
    sql`/* completeCopyrightMandatoryHumanReview:findPlacement */
    SELECT target.placement_id
    FROM copyright_notice_targets target
    JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    WHERE restriction.id = ${input.restrictionId}
      AND target.copyright_notice_id = ${input.noticeId}
  `,
  )
  const placement = placementRows[0]
  assert(placement, 409, 'Copyright restriction is not awaiting mandatory human review')
  await transaction(sql`/* completeCopyrightMandatoryHumanReview:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${getImagePlacementKey(placement.placement_id)}, 0))
  `)
  const { rows: locks } = await transaction<{ id: string }>(
    sql`/* completeCopyrightMandatoryHumanReview:lock */
    SELECT restriction.id
    FROM copyright_notices notice
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    WHERE notice.id = ${input.noticeId}
      AND restriction.id = ${input.restrictionId}
    FOR UPDATE OF notice, target, restriction
  `,
  )
  assert(locks[0], 409, 'Copyright restriction is not awaiting mandatory human review')
  const { rows } =
    await transaction<CopyrightRestrictionRecord>(sql`/* completeCopyrightMandatoryHumanReview */
    UPDATE copyright_restrictions
    SET human_reviewed_at = ${input.reviewedAt}, human_review_action = ${input.action},
      human_reviewed_by_id = ${input.currentUser.id}
    WHERE id = ${input.restrictionId}
      AND lifted_at IS NULL
      AND human_reviewed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM copyright_notices
        WHERE id = ${input.noticeId}
          AND accepted_at IS NOT NULL
          AND provisional_withholding_at IS NOT NULL
      )
    RETURNING id, copyright_notice_target_id, authorizing_assessment_id, imposed_at, lifted_at, imposed_by_id, lifted_by_id,
      human_reviewed_at, human_review_action, human_reviewed_by_id
  `)
  const restriction = rows[0]
  assert(restriction, 409, 'Copyright restriction is not awaiting mandatory human review')
  let restoreIntentId: string | null = null
  if (input.action === 'reverse') {
    const intent = await createCopyrightRestoreIntentForReversalInTransaction(
      restriction.id,
      transaction,
    )
    restoreIntentId = intent.id
  }
  const staydownImageIds = await applyCopyrightConfirmationConsequencesInTransaction(
    input.noticeId,
    transaction,
  )
  await transaction(sql`/* completeCopyrightMandatoryHumanReview:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id,
      copyright_restriction_id, review_action, review_rationale_ciphertext)
    VALUES (${input.noticeId}, 'mandatory_human_review_completed', ${input.currentUser.id},
      ${input.restrictionId}, ${input.action}, ${encryptSecret(
        input.rationale,
        `copyright-restriction-review:${input.restrictionId}`,
      )})
  `)
  await transaction.commit()
  if (restoreIntentId) void enqueueApplyCopyrightAction(restoreIntentId)
  enqueueCopyrightStaydownHashes(staydownImageIds)
  return restriction
}
