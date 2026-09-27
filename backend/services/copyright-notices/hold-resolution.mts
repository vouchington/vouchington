import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import type { CopyrightHoldResolutionKind, CopyrightLegalHoldResolutionRecord } from './types.mts'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { encryptSecret } from '@modules/token-secrets'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import { lockCopyrightNoticeHoldPlacements } from './hold-placement-locks.mts'
import {
  replayEligibleCopyrightRestoreIntentsInTransaction,
  selectBlockedCopyrightRestoreIntentIds,
} from './court-hold-restore-replay.mts'

type ResolveCopyrightLegalHoldInput = {
  currentUser: PrivateUser
  assessmentId: string
  resolvedAt: Date
  resolutionKind: CopyrightHoldResolutionKind
  rationale: string
}

export async function resolveCopyrightLegalHold(
  input: ResolveCopyrightLegalHoldInput,
): Promise<CopyrightLegalHoldResolutionRecord> {
  await using transaction = await beginTransaction()
  const result = await resolveCopyrightLegalHoldInTransaction(input, transaction)
  await transaction.commit()
  for (const intentId of result.intentIds) void enqueueApplyCopyrightAction(intentId)
  return result.resolution
}

/** The owner's legal record, exact replay and audit commit together; no external effects here. */
export async function resolveCopyrightLegalHoldInTransaction(
  input: ResolveCopyrightLegalHoldInput,
  transaction: TransactionQuery,
): Promise<{ resolution: CopyrightLegalHoldResolutionRecord; intentIds: string[] }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  const { rows: identities } = await transaction<{ copyright_notice_id: string }>(sql`
    /* resolveCopyrightLegalHold:identity */
    SELECT submission.copyright_notice_id FROM copyright_notice_legal_hold_assessments assessment
    JOIN copyright_notice_submissions submission ON submission.id = assessment.copyright_notice_submission_id
    WHERE assessment.id = ${input.assessmentId}
  `)
  assert(identities[0], 404, 'Copyright legal hold assessment not found')
  await lockCopyrightNoticeHoldPlacements(identities[0].copyright_notice_id, transaction)
  const { rows: assessmentRows } = await transaction<{
    copyright_notice_id: string
  }>(sql`/* resolveCopyrightLegalHold:lockAssessment */
    SELECT submission.copyright_notice_id
    FROM copyright_notice_legal_hold_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE assessment.id = ${input.assessmentId}
    FOR UPDATE OF notice, assessment
  `)
  const assessment = assessmentRows[0]
  assert(assessment, 404, 'Copyright legal hold assessment not found')
  const { rows } = await transaction(sql`/* resolveCopyrightLegalHold */
    INSERT INTO copyright_notice_legal_hold_resolutions (
      copyright_notice_legal_hold_assessment_id, resolved_at, resolved_by_id, resolution_kind,
      rationale_ciphertext
    ) VALUES (
      ${input.assessmentId}, ${input.resolvedAt}, ${input.currentUser.id}, ${input.resolutionKind},
      ${encryptSecret(input.rationale, `copyright-legal-hold-resolution:${input.assessmentId}`)}
    )
    ON CONFLICT (copyright_notice_legal_hold_assessment_id) DO NOTHING
    RETURNING id, copyright_notice_legal_hold_assessment_id, resolved_at, resolved_by_id,
      resolution_kind, rationale_ciphertext
  `)
  const resolution = rows[0] as CopyrightLegalHoldResolutionRecord | undefined
  assert(resolution, 409, 'Copyright legal hold is already resolved')
  await transaction(sql`/* resolveCopyrightLegalHold:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id,
      copyright_notice_legal_hold_resolution_id)
    VALUES (${assessment.copyright_notice_id}, 'legal_hold_resolved', ${input.currentUser.id}, ${resolution.id})
  `)
  const { rows: restrictionRows } = await transaction<{ id: string; intent_id: string }>(sql`
    /* resolveCopyrightLegalHold:affectedRestrictions */
    WITH hold_restrictions AS (
      SELECT restriction.id, target.placement_id
      FROM copyright_legal_hold_restrictions source
      JOIN copyright_restrictions restriction ON restriction.id = source.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE source.copyright_notice_legal_hold_assessment_id = ${input.assessmentId}
        AND restriction.lifted_at IS NULL
    ), intents AS (
      INSERT INTO copyright_notice_action_intents (
        copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision, action
      ) SELECT held.id, NULL, placement.revision, 'restore'
      FROM hold_restrictions held
      JOIN media_placements placement ON placement.id = held.placement_id
      ON CONFLICT (copyright_restriction_id, expected_placement_revision, action)
      DO UPDATE SET updated_at = copyright_notice_action_intents.updated_at
      RETURNING id, copyright_restriction_id
    ) SELECT held.id, intents.id AS intent_id
      FROM hold_restrictions held JOIN intents ON intents.copyright_restriction_id = held.id
  `)
  const replayedIds = await replayEligibleCopyrightRestoreIntentsInTransaction({
    noticeId: assessment.copyright_notice_id,
    intentIds: await selectBlockedCopyrightRestoreIntentIds(
      assessment.copyright_notice_id,
      transaction,
    ),
    now: input.resolvedAt,
    query: transaction,
  })
  return {
    resolution,
    intentIds: [...new Set([...restrictionRows.map(row => row.intent_id), ...replayedIds])],
  }
}
