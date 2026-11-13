import { expect } from 'vitest'
import { appendCopyrightLegalHoldAssessment } from '../services/copyright-notices/holds.mts'
import { createEligibleCopyrightRestoreIntent } from '../services/copyright-notices/restoration.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
  readCopyrightAssessmentRaceState,
} from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightLateHoldBindings } from './copyright-restoration-hold-scene.mts'

async function readFilingState(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('Owned filing case disappeared')
  return {
    aggregate: {
      ...aggregate,
      actionIntents: aggregate.actionIntents.map(row => ({
        id: row.id,
        copyright_restriction_id: row.copyright_restriction_id,
        copyright_notice_deadline_id: row.copyright_notice_deadline_id,
        expected_placement_revision: row.expected_placement_revision,
        action: row.action,
        state: row.state,
        attempt_count: row.attempt_count,
        lease_token: row.lease_token,
        leased_at: row.leased_at,
        completed_at: row.completed_at,
        completed_at_reason: row.completed_at_reason,
        available_at: row.available_at,
        failure_message: row.failure_message,
      })),
    },
    legal: await readCopyrightAssessmentRaceState(noticeId),
    bindings: await readCopyrightLateHoldBindings(noticeId),
  }
}

/** A nonqualifying assessment is atomic, including replay of an originally blocked intent. */
export async function assertNonqualifyingFilingOutcome(
  noticeId: string,
  input: Parameters<typeof appendCopyrightLegalHoldAssessment>[0],
  reopenedId?: string,
) {
  const before = await readFilingState(noticeId)
  const [result] = await Promise.allSettled([appendCopyrightLegalHoldAssessment(input)])
  const after = await readFilingState(noticeId)
  const id = after.aggregate.holdAssessments.find(
    row => row.copyright_notice_submission_id === input.submissionId,
  )?.id
  const hold = {
    id,
    copyright_notice_submission_id: input.submissionId,
    assessed_at: input.assessedAt,
    assessed_by_id: input.currentUser.id,
    is_from_original_claimant: input.fromOriginalClaimant,
    proceeding_kind: input.proceedingKind,
    ccb_claim_kind: input.ccbClaimKind,
    commenced_at: input.commencedAt,
    received_by_designated_agent_at: input.receivedByDesignatedAgentAt,
    is_same_material: input.sameMaterial,
    rationale_ciphertext: expect.any(String),
    target_ids: input.targetIds,
  }
  const events = ['legal_hold_assessed', ...(reopenedId ? ['copyright_action_replayed'] : [])]
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflicting copyright case change',
        causeCode: '40001',
      },
      state: before,
    },
    {
      outcome: { status: 'fulfilled', id },
      state: {
        ...before,
        aggregate: {
          ...before.aggregate,
          holdAssessments: [...before.aggregate.holdAssessments, expect.objectContaining(hold)],
          lifecycleEvents: [
            ...before.aggregate.lifecycleEvents,
            expect.objectContaining({
              change_type: 'legal_hold_assessed',
              changed_by_id: input.currentUser.id,
              copyright_notice_id: noticeId,
              copyright_notice_legal_hold_assessment_id: id,
            }),
            ...(reopenedId
              ? [
                  expect.objectContaining({
                    change_type: 'copyright_action_replayed',
                    copyright_notice_id: noticeId,
                    copyright_notice_action_intent_id: reopenedId,
                  }),
                ]
              : []),
          ],
          actionIntents: before.aggregate.actionIntents.map(row =>
            row.id === reopenedId
              ? {
                  ...row,
                  state: 'pending',
                  attempt_count: 0,
                  leased_at: null,
                  completed_at: null,
                  completed_at_reason: null,
                  available_at: expect.any(Date),
                  failure_message: 'Reopened after the legal blocker was resolved.',
                }
              : row,
          ),
        },
        legal: {
          ...before.legal,
          events: [...before.legal.events, ...events].toSorted(),
          actions: before.legal.actions.map(row =>
            row.id === reopenedId ? { ...row, state: 'pending' } : row,
          ),
        },
      },
    },
  ]).toContainEqual({ outcome: copyrightRaceResult(result!), state: after })
}

/** A court filing blocks restoration even if its assessment writer never commits. */
export async function assertUnassessedFilingGuard(
  input: Parameters<typeof createEligibleCopyrightRestoreIntent>[0],
  message = 'Copyright restoration awaits assessment of a court or CCB filing',
  statusCode = 409,
) {
  const before = await readFilingState(input.noticeId)
  const [result] = await Promise.allSettled([createEligibleCopyrightRestoreIntent(input)])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    {
      outcome: { status: 'rejected', statusCode, code: undefined, message, causeCode: undefined },
      state: before,
    },
  ]).toContainEqual({
    outcome: copyrightRaceResult(result!),
    state: await readFilingState(input.noticeId),
  })
}
