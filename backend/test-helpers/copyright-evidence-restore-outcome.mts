import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createEligibleCopyrightRestoreIntent } from '../services/copyright-notices/restoration.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

/** Every real probe runs against committed hold/resolution facts, including failed guards. */
export async function assertEvidenceRestoreProbe(
  input: Parameters<typeof createEligibleCopyrightRestoreIntent>[0],
  eligible: boolean,
) {
  const before = await readRestoreState(input.noticeId)
  const [result] = await Promise.allSettled([createEligibleCopyrightRestoreIntent(input)])
  const after = await readRestoreState(input.noticeId)
  const id = after.aggregate.actionIntents.find(
    row => row.action === 'restore' && row.copyright_restriction_id === input.restrictionId,
  )?.id
  const outcome =
    result!.status === 'fulfilled'
      ? {
          status: 'fulfilled',
          id: result!.value.id,
          action: result!.value.action,
          restriction: result!.value.copyright_restriction_id,
          deadline: result!.value.copyright_notice_deadline_id,
          revision: result!.value.expected_placement_revision,
        }
      : copyrightRaceResult(result!)
  const aborted = { outcome: nativeCopyrightSerializationConflict, state: before }
  const allowed = eligible
    ? [
        aborted,
        {
          outcome: {
            status: 'fulfilled',
            id,
            action: 'restore',
            restriction: input.restrictionId,
            deadline: input.deadlineId,
            revision: input.expectedPlacementRevision,
          },
          state: {
            aggregate: {
              ...before.aggregate,
              actionIntents: [
                ...before.aggregate.actionIntents,
                expect.objectContaining({
                  id,
                  copyright_restriction_id: input.restrictionId,
                  copyright_notice_deadline_id: input.deadlineId,
                  expected_placement_revision: input.expectedPlacementRevision,
                  action: 'restore',
                  state: 'pending',
                  attempt_count: 0,
                  completed_at: null,
                }),
              ],
              lifecycleEvents: [
                ...before.aggregate.lifecycleEvents,
                expect.objectContaining({
                  change_type: 'restoration_intent_created',
                  copyright_notice_action_intent_id: id,
                  copyright_notice_id: input.noticeId,
                  changed_by_id: null,
                }),
              ],
            },
            misuse: [
              ...before.misuse,
              {
                restriction: input.restrictionId,
                outcome: 'restriction_reversed_by_counter_notice',
              },
            ].toSorted((a, b) => a.restriction.localeCompare(b.restriction)),
          },
        },
      ]
    : [
        aborted,
        {
          outcome: {
            status: 'rejected',
            statusCode: 409,
            code: undefined,
            message: 'Copyright restoration is not eligible',
            causeCode: undefined,
          },
          state: before,
        },
      ]
  expect(allowed).toContainEqual({ outcome, state: after })
}

async function readRestoreState(noticeId: string) {
  const [aggregate, { rows: misuse }] = await Promise.all([
    getCopyrightNoticePrivateAggregate(noticeId),
    write<{ restriction: string; outcome: string }>(sql`/* readRestoreState:misuse */
      SELECT copyright_restriction_id AS restriction, outcome FROM copyright_claimant_misuse_events
      WHERE copyright_notice_id = ${noticeId} ORDER BY copyright_restriction_id`),
  ])
  if (!aggregate) throw new Error('Owned restore case disappeared')
  return { aggregate, misuse }
}
