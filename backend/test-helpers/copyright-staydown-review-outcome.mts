import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { expect } from 'vitest'
import { completeCopyrightMandatoryHumanReview } from '../services/copyright-notices/human-review.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import {
  effectiveReviewConflict,
  expectedEffectiveReview,
} from './copyright-effective-review-outcomes.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import type { createEffectiveStaydownNotice } from './copyright-effective-review-fixtures.mts'

/** A single real review binds registration, incident provenance, notices and audit to its result. */
export async function assertStaydownMandatoryReview(
  fixture: Awaited<ReturnType<typeof createEffectiveStaydownNotice>>,
  action: 'confirm' | 'reverse',
  index = 0,
) {
  const restriction = fixture.restrictions[index]!
  const before = await readEffectiveReviewState(fixture.noticeId, [fixture.claimant.id])
  const prior = before.state.restrictions.find(row => row.id === restriction.id)!
  if (prior.review !== null)
    throw new Error('Staydown subject requires committed unreviewed authority')
  const [{ rows: noticeRows }, enabled] = await Promise.all([
    write<{ claimant_user_id: string | null }>(sql`/* assertStaydownMandatoryReview:claimant */
      SELECT claimant_user_id FROM copyright_notices WHERE id = ${fixture.noticeId}`),
    isCopyrightStaydownMatchingEnabled(),
  ])
  const notice = noticeRows[0]
  if (!notice) throw new Error('Owned staydown notice disappeared')
  const [result] = await Promise.allSettled([
    completeCopyrightMandatoryHumanReview({
      currentUser: fixture.moderator,
      noticeId: fixture.noticeId,
      restrictionId: restriction.id,
      action,
      rationale: 'Reviewed the image against the claimed work.',
      reviewedAt: new Date(),
    }),
  ])
  const after = await readEffectiveReviewState(fixture.noticeId, [fixture.claimant.id])
  const success = expectedEffectiveReview(before, {
    noticeId: fixture.noticeId,
    restrictionId: restriction.id,
    targetId: restriction.targetId,
    revision: restriction.revision,
    action,
    moderatorId: fixture.moderator.id,
    posterId: fixture.claimant.id,
    kind: 'human',
    incidentUpdates: { [fixture.claimant.id]: action === 'confirm' ? true : null },
    ownerTargets: fixture.owners,
    staydown: enabled,
  })
  // Mandatory review is not an appeal disposition and never adds a claimant-misuse event.
  success.misuse = before.misuse
  if (notice.claimant_user_id !== null) {
    success.state.deliveries = [
      ...success.state.deliveries,
      `claimant_decision_notice:email:${notice.claimant_user_id}`,
      `claimant_decision_notice:in_app:${notice.claimant_user_id}`,
    ].toSorted()
  }
  // A first reverse has no existing registry entry to remove.
  if (action === 'reverse') success.state.staydown = before.state.staydown
  expect([
    {
      outcome: {
        status: 'fulfilled',
        id: restriction.id,
        target: restriction.targetId,
        assessment: prior.assessment,
        imposedBy: null,
        review: action,
        reviewer: fixture.moderator.id,
      },
      state: success,
    },
    { outcome: effectiveReviewConflict, state: before },
  ]).toContainEqual({ outcome: copyrightRaceResult(result!), state: after })
  return result!.status === 'fulfilled'
}
