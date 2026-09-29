import type { TransactionQuery } from '@data-stores/psql/types'
import { getImagePlacementForCopyright } from '@services/images/placements'
import sql from 'sql-template-strings'
import {
  copyrightActionDeliveryFacts,
  lockCopyrightActionDeadline,
  type CopyrightActionFacts,
} from './action-delivery-facts.mts'
import {
  hasCopyrightActionBlocker,
  type LockedCopyrightActionDelivery,
} from './action-delivery-locking.mts'
import { isCurrentPlacementForIntent } from './action-delivery-mutation.mts'
import { reopenCopyrightRestoreIntentInTransaction } from './action-delivery-state.mts'

/** The caller owns the complete case placement fence and notice lock through commit. */
export async function selectBlockedCopyrightRestoreIntentIds(
  noticeId: string,
  query: TransactionQuery,
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(sql`/* selectBlockedCopyrightRestoreIntentIds */
    SELECT intent.id FROM copyright_notice_action_intents intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId}
      AND intent.action = 'restore' AND intent.state = 'blocked'
    ORDER BY intent.id
  `)
  return rows.map(row => row.id)
}

/** Rechecks blocked state and original authority; provider failures require explicit operator replay. */
export async function replayEligibleCopyrightRestoreIntentsInTransaction(input: {
  noticeId: string
  intentIds: string[]
  now: Date
  query: TransactionQuery
}): Promise<string[]> {
  const reopened: string[] = []
  for (const intentId of input.intentIds) {
    // oxlint-disable-next-line no-await-in-loop -- each original intent is locked, proved and reset under the retained case fence.
    if (await replayOriginalRestore(intentId, input)) reopened.push(intentId)
  }
  return reopened
}

async function replayOriginalRestore(
  intentId: string,
  input: { noticeId: string; now: Date; query: TransactionQuery },
): Promise<boolean> {
  const statement = copyrightActionDeliveryFacts()
  statement.append(sql`/* replayEligibleCopyrightRestoreIntentsInTransaction:lock */
    WHERE intent.id = ${intentId} AND target.copyright_notice_id = ${input.noticeId}
      AND intent.action = 'restore' AND intent.state = 'blocked'
    FOR UPDATE OF intent, restriction, target`)
  const { rows } = await input.query<CopyrightActionFacts>(statement)
  const facts = rows[0]
  if (!facts) return false
  const legal = await lockCopyrightActionDeadline(facts, input.query)
  if (!legal || (await hasCopyrightActionBlocker(legal, input.now, input.query))) return false
  if (!(await originalRestorationAuthorityIsValid(legal, input.now, input.query))) return false
  const current = await getImagePlacementForCopyright(legal.placement_id, { query: input.query })
  if (!isCurrentPlacementForIntent(current, legal)) return false
  const { rows: images } = await input.query<{ ready: boolean }>(sql`
    /* replayEligibleCopyrightRestoreIntentsInTransaction:readiness */
    SELECT upload_completed_at IS NOT NULL AND deleted_at IS NULL
      AND quarantine_pending_at IS NULL AND openai_omni_moderation_flagged = FALSE
      AND openai_omni_moderation_results IS NOT NULL
      AND openai_omni_moderation_created_at IS NOT NULL AS ready
    FROM images WHERE id = ${legal.image_id}
  `)
  if (!images[0]?.ready) return false
  return reopenCopyrightRestoreIntentInTransaction(intentId, input.query)
}

async function originalRestorationAuthorityIsValid(
  legal: LockedCopyrightActionDelivery,
  now: Date,
  query: TransactionQuery,
): Promise<boolean> {
  if (
    legal.human_review_action === 'reverse' ||
    legal.reversal_authorized ||
    legal.hold_resolution_authorized
  )
    return true
  if (
    !legal.copyright_notice_deadline_id ||
    !legal.human_reviewed_at ||
    !legal.earliest_restoration_at ||
    legal.earliest_restoration_at > now ||
    legal.cancelled_at !== null ||
    (legal.resolved_at !== null && legal.restriction_lifted_at === null)
  )
    return false
  const { rows } = await query<{ valid: boolean }>(sql`
    /* replayEligibleCopyrightRestoreIntentsInTransaction:originalCounterNotice */
    SELECT EXISTS (
      SELECT 1 FROM copyright_notice_deadlines deadline
      JOIN copyright_notice_submission_assessments assessment
        ON assessment.id = deadline.qualifying_counter_notice_assessment_id
      JOIN copyright_notice_submissions submission ON submission.id = assessment.copyright_notice_submission_id
      JOIN copyright_notice_counter_notice_assessment_targets scope
        ON scope.copyright_notice_submission_assessment_id = assessment.id
      JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = scope.copyright_notice_target_id
      WHERE deadline.id = ${legal.copyright_notice_deadline_id}
        AND deadline.copyright_notice_id = ${legal.copyright_notice_id}
        AND restriction.id = ${legal.copyright_restriction_id}
        AND submission.kind = 'counter_notice' AND assessment.substantially_compliant
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_assessments newer
          WHERE newer.supersedes_assessment_id = assessment.id)
    ) AS valid
  `)
  return rows[0]?.valid ?? false
}
