import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'

export async function assertCopyrightEvidenceAllowsDeletion(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  const { rows } = await query<{ blocked: boolean }>(sql`
    /* deleteUser:copyrightEvidence */
    SELECT (
      EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_incidents
        WHERE account_user_id = ${userId} AND operative
      )
      OR EXISTS (
        SELECT 1
        FROM posts post
        JOIN image_placements image_placement ON image_placement.post_id = post.id
        JOIN media_placements placement ON placement.id = image_placement.placement_id
        JOIN copyright_notice_targets target
          ON target.placement_key = concat('image-placement:', placement.id)
        JOIN copyright_notice_legal_hold_assessment_targets hold_target
          ON hold_target.copyright_notice_target_id = target.id
        JOIN copyright_notice_legal_hold_assessments hold
          ON hold.id = hold_target.copyright_notice_legal_hold_assessment_id
        LEFT JOIN copyright_notice_legal_hold_resolutions resolved
          ON resolved.copyright_notice_legal_hold_assessment_id = hold.id
        WHERE post.created_by_id = ${userId}
          AND resolved.id IS NULL
          AND hold.from_original_claimant
          AND hold.same_material
          AND hold.proceeding_kind IS NOT NULL
          AND hold.commenced_at IS NOT NULL
          AND hold.received_by_designated_agent_at IS NOT NULL
      )
    ) AS blocked
  `)
  assert(
    rows[0]?.blocked !== true,
    409,
    'Account deletion is blocked while a copyright incident or legal hold is unresolved',
  )
}
