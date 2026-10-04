import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { LockedCopyrightActionDelivery } from './action-delivery-locking-types.mts'
import {
  anyReversalSourceSql,
  reverseReviewSourceSql,
  appealReversalSourceSql,
  administratorLiftSourceSql,
} from './restriction-reversal-sources-sql.mts'

export type CopyrightActionFacts = Omit<
  LockedCopyrightActionDelivery,
  'earliest_restoration_at' | 'resolved_at' | 'cancelled_at'
>

/** The immutable intent identity and its existing restoration authority, shared by delivery and replay. */
export function copyrightActionDeliveryFacts() {
  return sql`/* copyrightActionDeliveryFacts */
    SELECT intent.lease_token, target.copyright_notice_id, intent.copyright_restriction_id, target.placement_id,
    target_image.image_id, intent.expected_placement_revision, intent.action,
    intent.copyright_notice_deadline_id,
    restriction.lifted_at AS restriction_lifted_at, restriction.human_reviewed_at,
    restriction.human_review_action,
    `
    .append(anyReversalSourceSql)
    .append(sql` AS reversal_authorized, `)
    .append(reverseReviewSourceSql)
    .append(sql` AS reversal_by_review, `)
    .append(appealReversalSourceSql)
    .append(sql` AS reversal_by_appeal, `)
    .append(administratorLiftSourceSql).append(sql` AS reversal_by_administrator_lift,
    EXISTS (
      SELECT 1 FROM copyright_legal_hold_restrictions hold_restriction
      JOIN copyright_notice_legal_hold_resolutions hold_resolution
        ON hold_resolution.copyright_notice_legal_hold_assessment_id =
          hold_restriction.copyright_notice_legal_hold_assessment_id
      WHERE hold_restriction.copyright_restriction_id = restriction.id
    ) AS hold_resolution_authorized
    FROM copyright_notice_action_intents intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN copyright_notice_target_images target_image
      ON target_image.copyright_notice_target_id = target.id`)
}

export async function lockCopyrightActionDeadline(
  facts: CopyrightActionFacts,
  query: TransactionQuery,
): Promise<LockedCopyrightActionDelivery | null> {
  if (!facts.copyright_notice_deadline_id) {
    return { ...facts, earliest_restoration_at: null, resolved_at: null, cancelled_at: null }
  }
  const { rows } = await query<
    Pick<LockedCopyrightActionDelivery, 'earliest_restoration_at' | 'resolved_at' | 'cancelled_at'>
  >(sql`/* lockCopyrightActionDelivery:deadline */
    SELECT earliest_restoration_at, resolved_at, cancelled_at
    FROM copyright_notice_deadlines
    WHERE id = ${facts.copyright_notice_deadline_id}
    FOR UPDATE
  `)
  return rows[0] ? { ...facts, ...rows[0] } : null
}
