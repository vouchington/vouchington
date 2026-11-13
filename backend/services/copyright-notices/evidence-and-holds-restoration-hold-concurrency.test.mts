import { createCommittedCopyrightRestorationScene } from '@voucha/test-helpers/copyright-restoration-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { appendCopyrightLegalHoldAssessment, processCopyrightActionIntent } from './index.mts'
import { readCopyrightLateHoldBindings } from '@voucha/test-helpers/copyright-restoration-hold-scene'

describe('late legal-hold and restoration concurrency', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the placement withheld when a legal hold overlaps restoration', async () => {
    const { moderator, notice, restorationAt, restore, target, initialWithhold, holdSubmission } =
      await createCommittedCopyrightRestorationScene()

    const [restoreOutcome, holdOutcome] = await Promise.allSettled([
      processCopyrightActionIntent(restore.id, restorationAt),
      appendCopyrightLegalHoldAssessment({
        currentUser: moderator,
        submissionId: holdSubmission.id,
        assessedAt: new Date(restorationAt.getTime() + 60_000),
        fromOriginalClaimant: true,
        proceedingKind: 'federal_court',
        ccbClaimKind: null,
        commencedAt: new Date(restorationAt.getTime() - 60_000),
        receivedByDesignatedAgentAt: new Date(restorationAt.getTime() - 1),
        sameMaterial: true,
        targetIds: [target.id],
        rationale: 'Verified qualifying filing during restoration.',
      }),
    ])

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const original = aggregate!.restrictions.find(
      row => row.id === restore.copyright_restriction_id,
    )!
    const work = aggregate!.actionIntents.find(row => row.id === restore.id)!
    const native = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({ code: '40001' }),
    })
    const holdAbort = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'CONFLICT',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const holdSuccess = expect.objectContaining({
      status: 'fulfilled',
      value: expect.objectContaining({ target_ids: [target.id] }),
    })
    const noHold = { holds: [], audits: 0 }
    const held = {
      holds: [{ submission: holdSubmission.id, actor: moderator.id, targets: [target.id] }],
      audits: 1,
    }
    const state = {
      restoration: restoreOutcome,
      hold: holdOutcome,
      holds: aggregate!.holdAssessments.map(row => ({
        submission: row.copyright_notice_submission_id,
        actor: row.assessed_by_id,
        targets: row.target_ids,
      })),
      audits: aggregate!.lifecycleEvents.filter(row => row.change_type === 'legal_hold_assessed')
        .length,
      originalLifted: original.lifted_at !== null,
      activeRestrictions: aggregate!.restrictions.filter(row => row.lifted_at === null).length,
      withheld: (await getImagePlacementForCopyright(target.placement_id))?.withheld,
      work: work.state,
      attempts: work.attempt_count,
      lateRestrictions: aggregate!.restrictions
        .filter(row => row.id !== original.id)
        .map(row => ({
          target: row.copyright_notice_target_id,
          authority: row.authorizing_assessment_id,
          active: row.lifted_at === null,
        })),
      lateActions: aggregate!.actionIntents
        .filter(row => row.id !== restore.id && row.id !== initialWithhold.id)
        .map(row => ({
          action: row.action,
          state: row.state,
          restriction: row.copyright_restriction_id,
        })),
      bindings: await readCopyrightLateHoldBindings(notice.id),
    }
    const protectedState = {
      originalLifted: false,
      activeRestrictions: 1,
      withheld: true,
      lateRestrictions: [],
      lateActions: [],
      bindings: [],
    }
    const allowed: unknown[] = [
      {
        restoration: native,
        hold: holdAbort,
        ...noHold,
        ...protectedState,
        work: 'pending',
        attempts: 0,
      },
      {
        restoration: native,
        hold: holdAbort,
        ...noHold,
        ...protectedState,
        work: 'claimed',
        attempts: 1,
      },
      // The committed, unassessed filing independently blocks restoration if assessment aborts.
      {
        restoration: { status: 'fulfilled', value: 'blocked' },
        hold: holdAbort,
        ...noHold,
        ...protectedState,
        work: 'blocked',
        attempts: 1,
      },
      {
        restoration: { status: 'fulfilled', value: 'blocked' },
        hold: holdSuccess,
        ...held,
        ...protectedState,
        work: 'blocked',
        attempts: 1,
      },
    ]
    for (const attempts of [0, 1]) {
      allowed.push({
        restoration: { status: 'fulfilled', value: 'not_claimed' },
        hold: holdSuccess,
        ...held,
        ...protectedState,
        work: 'blocked',
        attempts,
      })
      allowed.push({
        restoration: native,
        hold: holdSuccess,
        ...held,
        ...protectedState,
        work: 'blocked',
        attempts,
      })
    }
    expect(allowed).toContainEqual(state)
  })
})
