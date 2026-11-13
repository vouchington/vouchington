import { recordCopyrightRepeatInfringerDisposition } from '../services/copyright-notices/repeat-infringer-dispositions.mts'
import { expect } from 'vitest'
import { reviewCopyrightAppeal } from '../services/copyright-notices/submission-reviews.mts'
import { completeCopyrightMandatoryHumanReview } from '../services/copyright-notices/human-review.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { seedEffectiveReviewAppeal } from './copyright-effective-review-decisions.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  effectiveReviewConflict,
  expectedEffectiveReview,
} from './copyright-effective-review-outcomes.mts'
import type { createEffectiveReviewNotice } from './copyright-effective-review-fixtures.mts'
import type { PrivateUser } from '../services/users/types.mts'

type Fixture = Awaited<ReturnType<typeof createEffectiveReviewNotice>>

/** Exactly one real appeal review; either all legal effects commit or the invocation rolls back. */
export async function assertEffectiveAppeal(
  fixture: Fixture,
  poster: PrivateUser,
  moderator: PrivateUser,
  action: 'confirm' | 'reverse',
  updates: Record<string, boolean | null>,
  index = 0,
  appealId?: string,
) {
  const restriction = fixture.restrictions[index]!
  const submissionId =
    appealId ??
    (await seedEffectiveReviewAppeal(fixture.noticeId, poster.id, restriction.targetId)).submission
      .id
  const before = await readEffectiveReviewState(fixture.noticeId, Object.keys(fixture.owners))
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const [result] = await Promise.allSettled([
    reviewCopyrightAppeal({
      submissionId,
      currentUser: moderator,
      recommendationId: null,
      manualFallbackReason: 'The retained record supports a manual review.',
      rationale: 'The retained evidence was reviewed.',
      decisions: [{ restrictionId: restriction.id, action }],
    }),
  ])
  const after = await readEffectiveReviewState(fixture.noticeId, Object.keys(fixture.owners))
  const reviewId = after.appeals.find(row => row.submission === submissionId)?.id
  const success = expectedEffectiveReview(before, {
    noticeId: fixture.noticeId,
    restrictionId: restriction.id,
    targetId: restriction.targetId,
    revision: restriction.revision,
    action,
    moderatorId: moderator.id,
    posterId: poster.id,
    kind: 'appeal',
    submissionId,
    reviewId,
    incidentUpdates: updates,
    ownerTargets: fixture.owners,
    staydown,
  })
  const outcome =
    result!.status === 'fulfilled'
      ? {
          status: 'fulfilled',
          noticeId: result!.value.noticeId,
          reviewIds: result!.value.reviewIds,
        }
      : copyrightRaceResult(result!)
  expect([
    {
      outcome: { status: 'fulfilled', noticeId: fixture.noticeId, reviewIds: [reviewId] },
      state: success,
    },
    { outcome: effectiveReviewConflict, state: before },
  ]).toContainEqual({ outcome, state: after })
}

/** Exactly one real confirmation, with retained account and threshold effects in its same TX. */
export async function assertEffectiveConfirmation(
  fixture: Fixture,
  poster: PrivateUser,
  moderator: PrivateUser,
  updates: Record<string, boolean | null>,
  index = 0,
) {
  const restriction = fixture.restrictions[index]!
  const before = await readEffectiveReviewState(fixture.noticeId, Object.keys(fixture.owners))
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const [result] = await Promise.allSettled([
    completeCopyrightMandatoryHumanReview({
      currentUser: moderator,
      noticeId: fixture.noticeId,
      restrictionId: restriction.id,
      action: 'confirm',
      rationale: 'The reviewed restriction is appropriate.',
      reviewedAt: new Date(),
    }),
  ])
  const after = await readEffectiveReviewState(fixture.noticeId, Object.keys(fixture.owners))
  const prior = before.state.restrictions.find(row => row.id === restriction.id)!
  const success = expectedEffectiveReview(before, {
    noticeId: fixture.noticeId,
    restrictionId: restriction.id,
    targetId: restriction.targetId,
    revision: restriction.revision,
    action: 'confirm',
    moderatorId: moderator.id,
    posterId: poster.id,
    kind: 'human',
    incidentUpdates: updates,
    ownerTargets: fixture.owners,
    staydown,
  })
  expect([
    {
      outcome: {
        status: 'fulfilled',
        id: restriction.id,
        target: restriction.targetId,
        assessment: prior.assessment,
        imposedBy: null,
        review: 'confirm',
        reviewer: moderator.id,
      },
      state: success,
    },
    { outcome: effectiveReviewConflict, state: before },
  ]).toContainEqual({ outcome: copyrightRaceResult(result!), state: after })
}

export async function assertEffectiveDisposition(
  fixture: Fixture,
  poster: PrivateUser,
  moderator: PrivateUser,
  incidentId: string,
) {
  const before = await readEffectiveReviewState(fixture.noticeId, Object.keys(fixture.owners))
  const [result] = await Promise.allSettled([
    recordCopyrightRepeatInfringerDisposition({
      currentUser: moderator,
      incidentId,
      disposition: 'duplicate',
      rationale: 'The case duplicates an earlier notice.',
      recordedAt: new Date(),
    }),
  ])
  const after = await readEffectiveReviewState(fixture.noticeId, Object.keys(fixture.owners))
  const success = {
    ...before,
    accounts: before.accounts.map(row =>
      row.id === poster.id
        ? {
            ...row,
            incidents: row.incidents.map(incident =>
              incident.notice === fixture.noticeId
                ? { ...incident, operative: false, disposition: 'duplicate' }
                : incident,
            ),
          }
        : row,
    ),
    dispositions: [
      ...before.dispositions,
      { account: poster.id, disposition: 'duplicate', reviewer: moderator.id },
    ].toSorted((a, b) => a.account.localeCompare(b.account)),
  }
  expect([
    { outcome: { status: 'fulfilled' }, state: success },
    { outcome: effectiveReviewConflict, state: before },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: after,
  })
}
