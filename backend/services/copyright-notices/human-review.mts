import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightHumanReviewAction, CopyrightRestrictionRecord } from './types.mts'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export async function completeCopyrightMandatoryHumanReview(input: {
  currentUser: PrivateUser
  noticeId: string
  restrictionId: string
  action: CopyrightHumanReviewAction
  reviewedAt: Date
}): Promise<CopyrightRestrictionRecord> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  await using transaction = await beginTransaction()
  const { rows: placementRows } = await transaction<{ placement_key: string }>(
    sql`/* completeCopyrightMandatoryHumanReview:findPlacement */
    SELECT target.placement_key
    FROM copyright_notice_targets target
    JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    WHERE restriction.id = ${input.restrictionId}
      AND target.copyright_notice_id = ${input.noticeId}
  `,
  )
  const placement = placementRows[0]
  assert(placement, 409, 'Copyright restriction is not awaiting mandatory human review')
  await transaction(sql`/* completeCopyrightMandatoryHumanReview:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${placement.placement_key}, 0))
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
    RETURNING id, copyright_notice_target_id, imposed_at, lifted_at, imposed_by_id, lifted_by_id,
      human_reviewed_at, human_review_action, human_reviewed_by_id
  `)
  const restriction = rows[0]
  assert(restriction, 409, 'Copyright restriction is not awaiting mandatory human review')
  await transaction(sql`/* completeCopyrightMandatoryHumanReview:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${input.noticeId}, 'mandatory_human_review_completed', ${input.currentUser.id},
      ${JSON.stringify({ restrictionId: input.restrictionId, action: input.action })}::jsonb)
  `)
  await transaction.commit()
  return restriction
}
