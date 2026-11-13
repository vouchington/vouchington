import { expect } from 'vitest'
import {
  liftSuspendedClaimantAutomaticRestrictions,
  searchSuspendedClaimantAutomaticRestrictionNoticeIds,
} from '../services/copyright-notices/claimant-suspension-lifts.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { readTestClaimantSuspensionReversal } from './services/copyright-notices/automatic-withholding-reads.mts'
import { readTestClaimantMisuseSummary } from './services/copyright-notices/claimant-abuse-fixtures.mts'
import { readTestOwnedCopyrightSweepIds } from './services/copyright-notices/sweep-ids.mts'

/** A job invocation may abort; every restriction, restore, statement and reversal marker rolls back. */
export async function assertServiceClaimantSuspensionLift(input: {
  noticeId: string
  restrictionId: string
  claimantId: string
  moderatorId: string
}) {
  const before = await readEffectiveReviewState(input.noticeId, [])
  const restriction = before.state.restrictions.find(row => row.id === input.restrictionId)!
  const target = before.state.targets.find(row => row.id === restriction.target)!
  const posterId = before.state.deliveries
    .find(row => row.startsWith('poster_restriction_notice:in_app:'))!
    .split(':')[2]!
  const misuse = await readTestClaimantMisuseSummary(input.claimantId)
  const [result] = await Promise.allSettled([
    liftSuspendedClaimantAutomaticRestrictions(input.noticeId),
  ])
  const after = await readEffectiveReviewState(input.noticeId, [])
  const reversal = await readTestClaimantSuspensionReversal(input.restrictionId)
  const ids = await readTestOwnedCopyrightSweepIds(
    searchSuspendedClaimantAutomaticRestrictionNoticeIds,
    input.noticeId,
  )
  const reversed = restriction.review === 'reverse'
  const success = reversed
    ? before
    : {
        ...before,
        state: {
          ...before.state,
          restrictions: before.state.restrictions.map(row =>
            row.id === input.restrictionId
              ? { ...row, review: 'reverse', reviewer: input.moderatorId }
              : row,
          ),
          actions: [
            ...before.state.actions,
            {
              id: expect.any(String),
              restriction: input.restrictionId,
              deadline: null,
              revision: target.placement_revision,
              action: 'restore',
              state: 'pending',
            },
          ],
          events: [...before.state.events, 'reversal_restoration_intent_created'].toSorted(),
          deliveries: [
            ...before.state.deliveries,
            `poster_review_notice:email:${posterId}`,
            `poster_review_notice:in_app:${posterId}`,
            `claimant_decision_notice:email:${input.claimantId}`,
            `claimant_decision_notice:in_app:${input.claimantId}`,
          ].toSorted(),
          correspondence: [
            ...before.state.correspondence,
            ...Array<string>(2).fill('decision_notice'),
          ].toSorted(),
        },
      }
  expect([
    {
      outcome: { status: 'fulfilled' },
      state: success,
      reversal: { recorded: true, restoreIntents: 1 },
      ids: [],
      misuse,
    },
    {
      outcome: nativeCopyrightSerializationConflict,
      state: before,
      reversal: { recorded: reversed, restoreIntents: reversed ? 1 : 0 },
      ids: reversed ? [] : [input.noticeId],
      misuse,
    },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: after,
    reversal,
    ids,
    misuse: await readTestClaimantMisuseSummary(input.claimantId),
  })
}

/** An ineligible case stays byte-for-byte in the same observable legal state after the job. */
export async function assertServiceClaimantSuspensionNoop(noticeId: string, restrictionId: string) {
  const before = await readEffectiveReviewState(noticeId, [])
  const marker = await readTestClaimantSuspensionReversal(restrictionId)
  const [result] = await Promise.allSettled([liftSuspendedClaimantAutomaticRestrictions(noticeId)])
  expect([
    { outcome: { status: 'fulfilled' }, state: before, marker },
    { outcome: nativeCopyrightSerializationConflict, state: before, marker },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: await readEffectiveReviewState(noticeId, []),
    marker: await readTestClaimantSuspensionReversal(restrictionId),
  })
}
