import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'node:assert/strict'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { getImagePlacementForCopyright } from '../services/images/placements.mts'
import {
  noticeHasUnassessedCourtOrCcbFiling,
  copyrightTargetRestoreIsBlocked,
} from '../services/copyright-notices/court-hold-assessment-gate.mts'
import { advanceCopyrightLastLegalActivityAt } from '../services/copyright-notices/last-legal-activity.mts'
import { recordCounterNoticeRestoration } from '../services/copyright-notices/claimant-misuse-ledger.mts'
import type { createEligibleCopyrightRestoreIntent } from '../services/copyright-notices/restoration.mts'
import type { CopyrightActionIntentRecord } from '../services/copyright-notices/types.mts'

/** Complete pending restore dependency, while preserving the canonical current-authority guards. */
export async function seedCommittedRestorationIntent(
  input: Parameters<typeof createEligibleCopyrightRestoreIntent>[0],
) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    placement_id: string
    placement_revision: number
    human_reviewed_at: Date | null
    lifted_at: Date | null
    earliest_restoration_at: Date
    resolved_at: Date | null
    cancelled_at: Date | null
  }>(sql`/* seedCommittedRestorationIntent:authority */
    SELECT target.placement_id, target.placement_revision, restriction.human_reviewed_at,
      restriction.lifted_at, deadline.earliest_restoration_at, deadline.resolved_at, deadline.cancelled_at
    FROM copyright_notice_targets target
    JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    JOIN copyright_notice_deadlines deadline ON deadline.copyright_notice_id = target.copyright_notice_id
    JOIN copyright_notice_submission_assessment_identities identity
      ON identity.id = deadline.qualifying_counter_notice_assessment_identity_id
    JOIN copyright_notice_counter_notice_assessment_targets scope
      ON scope.copyright_notice_submission_assessment_identity_id = identity.id
      AND scope.copyright_notice_target_id = target.id
    JOIN copyright_notice_submissions counter ON counter.id = identity.copyright_notice_submission_id
    WHERE target.copyright_notice_id = ${input.noticeId} AND target.id = ${input.targetId}
      AND restriction.id = ${input.restrictionId} AND deadline.id = ${input.deadlineId}
      AND counter.kind = 'counter_notice' AND counter.current_assessment_identity_id = identity.id
      AND counter.current_assessment_is_substantially_compliant`)
  const authority = rows[0]
  assert(authority, 'Copyright notice restoration record not found')
  assert(
    authority.placement_revision === input.expectedPlacementRevision,
    'Placement revision changed',
  )
  assert(authority.lifted_at === null, 'Copyright restriction is already lifted')
  assert(
    authority.resolved_at === null && authority.cancelled_at === null,
    'Restoration deadline is closed',
  )
  assert(
    !(await noticeHasUnassessedCourtOrCcbFiling(input.noticeId, transaction)),
    'Copyright restoration awaits assessment of a court or CCB filing',
  )
  assert(
    authority.human_reviewed_at !== null &&
      input.now >= authority.earliest_restoration_at &&
      !(await copyrightTargetRestoreIsBlocked(
        input.noticeId,
        input.restrictionId,
        input.now,
        transaction,
      )),
    'Copyright restoration is not eligible',
  )
  const placement = await getImagePlacementForCopyright(authority.placement_id, {
    query: transaction,
  })
  assert(placement, 'Copyright placement is unavailable')
  await advanceCopyrightLastLegalActivityAt(transaction, { noticeId: input.noticeId })
  const { rows: inserted } =
    await transaction<CopyrightActionIntentRecord>(sql`/* seedCommittedRestorationIntent */
    INSERT INTO copyright_notice_action_work_items (copyright_restriction_id, copyright_notice_deadline_id,
      expected_placement_revision, action)
    SELECT ${input.restrictionId}, ${input.deadlineId}, ${placement.revision}, 'restore'
    WHERE NOT EXISTS (SELECT 1 FROM copyright_notice_action_work_items
      WHERE copyright_restriction_id = ${input.restrictionId} AND expected_placement_revision = ${placement.revision}
        AND action = 'restore')
    ON CONFLICT (copyright_restriction_id, expected_placement_revision, action) DO NOTHING
    RETURNING id, copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision, action, completed_at`)
  const restore = inserted[0]
  assert(restore, 'A restore intent already exists for this placement revision')
  await readCopyrightThreadRetirement(transaction, [input.noticeId])
  await recordCounterNoticeRestoration(transaction, input)
  await transaction(sql`/* seedCommittedRestorationIntent:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_action_intent_id)
    VALUES (${input.noticeId}, 'restoration_intent_created', ${restore.id})`)
  await transaction.commit()
  return restore
}
