import { readCopyrightEnforcementRequest } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { describe, expect, it } from 'vitest'
import {
  completeTestCopyrightActionClaim,
  createTestRejectedCopyrightResponse,
  expireTestCopyrightEnforcementClaim,
} from '@voucha/test-helpers/copyright-lease-fencing'
import {
  expireTestCopyrightDeliveryIntentClaim,
  expireTestCopyrightEmailIntakeResponseClaim,
} from '@voucha/test-helpers/data-stores/psql/copyright-delivery-claims'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  createCounterNoticeRestoreIntent,
  createCopyrightRestorationHoldFixture,
} from './evidence-and-holds-restoration-hold-fixtures.mts'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  claimCopyrightDeliveryIntent,
  createCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentSent,
  markCopyrightDeliveryIntentFailed,
  markCopyrightEmailIntakeResponseSent,
  markCopyrightEmailIntakeResponseFailed,
  prepareCopyrightEmailIntakeResponseDelivery,
  processCopyrightEnforcementRequest,
} from './index.mts'
import { claimCopyrightActionIntent, failCopyrightActionIntent } from './action-delivery-state.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import { executeCopyrightActionIntent } from './action-delivery-execution.mts'
import { getCopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import {
  claimCopyrightEnforcementRequest,
  completeNonEnforceableCopyrightEnforcementRequest,
} from './enforcement-request-claim.mts'

// Form screening's reclaimed-owner regression is owned by form-screening-executions.test.mts.
describe('copyright queue lease fencing', () => {
  it('rejects the reclaimed delivery owner completion and failure', async () => {
    const { notice } = await createCopyrightRestorationHoldFixture()
    const intent = await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: null,
      correspondenceId: null,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: crypto.randomUUID(),
    })
    const old = (await claimCopyrightDeliveryIntent(intent.id))!
    await expireTestCopyrightDeliveryIntentClaim(intent.id, 1)
    const current = (await claimCopyrightDeliveryIntent(intent.id))!
    expect(current.lease_token).not.toBe(old.lease_token)
    expect(
      await markCopyrightDeliveryIntentFailed({
        intentId: intent.id,
        leaseToken: old.lease_token,
        error: 'late',
      }),
    ).toBe(false)
    expect(
      await markCopyrightDeliveryIntentSent({ intentId: intent.id, leaseToken: old.lease_token }),
    ).toBe(false)
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId: intent.id,
        leaseToken: current.lease_token,
      }),
    ).toBe(true)
    expect(
      await markCopyrightDeliveryIntentFailed({
        intentId: intent.id,
        leaseToken: old.lease_token,
        error: 'late',
      }),
    ).toBe(false)
  })

  it('rejects the reclaimed intake response owner completion and failure', async () => {
    const responseId = await createTestRejectedCopyrightResponse()
    const old = await prepareCopyrightEmailIntakeResponseDelivery(responseId)
    await expireTestCopyrightEmailIntakeResponseClaim(responseId, 1)
    const current = await prepareCopyrightEmailIntakeResponseDelivery(responseId)
    expect(current.leaseToken).not.toBe(old.leaseToken)
    expect(
      await markCopyrightEmailIntakeResponseFailed({
        responseId,
        leaseToken: old.leaseToken,
        error: 'late',
      }),
    ).toBe(false)
    expect(
      await markCopyrightEmailIntakeResponseSent({
        responseId,
        leaseToken: old.leaseToken,
        sesMessageId: 'late',
      }),
    ).toBe(false)
    expect(
      await markCopyrightEmailIntakeResponseSent({
        responseId,
        leaseToken: current.leaseToken,
        sesMessageId: crypto.randomUUID(),
      }),
    ).toBe(true)
    expect(
      await markCopyrightEmailIntakeResponseFailed({
        responseId,
        leaseToken: old.leaseToken,
        error: 'late',
      }),
    ).toBe(false)
  })

  it('rejects reclaimed action completion, failure, and execution before side effects', async () => {
    const { notice, intent } = await createActionClaimFixture()
    const now = new Date()
    const old = (await claimCopyrightActionIntent(intent.id, now))!
    const later = new Date(now.getTime() + 16 * 60 * 1000)
    const current = (await claimCopyrightActionIntent(intent.id, later))!
    expect(current.lease_token).not.toBe(old.lease_token)
    await completeTestCopyrightActionClaim(intent.id, old.lease_token, later)
    expect(
      await failCopyrightActionIntent({
        intentId: intent.id,
        leaseToken: old.lease_token,
        failedAt: later,
        failureMessage: 'late',
      }),
    ).toBe('not_claimed')
    expect(
      await executeCopyrightActionIntent(
        old,
        later,
        getCopyrightActionDeliveryDependencies(
          createTestCopyrightDeliveryDependencies(async () => {
            throw new Error('stale owner published')
          }),
        ),
      ),
    ).toBe('not_claimed')
    const failure = new Error('expired worker failed')
    let denialPublished = false
    await expect(
      compensateCopyrightActionFailure(
        old,
        later,
        {
          placementId: old.placement_id,
          revision: old.expected_placement_revision,
          imageId: old.image_id,
        },
        getCopyrightActionDeliveryDependencies({
          prepublishImagePlacementDenial: async () => {
            denialPublished = true
          },
        }),
        failure,
      ),
    ).rejects.toBe(failure)
    expect(denialPublished).toBe(false)
    expect((await getCopyrightNoticePrivateAggregate(notice.id))!.actionIntents[0]!.state).toBe(
      'claimed',
    )
    await completeTestCopyrightActionClaim(intent.id, current.lease_token, later)
    expect((await getCopyrightNoticePrivateAggregate(notice.id))!.actionIntents[0]!.state).toBe(
      'completed',
    )
  })

  it('keeps an expired competing claim out while compensation is running', async () => {
    const { intent, now } = await createActionClaimFixture('restore')
    const old = (await claimCopyrightActionIntent(intent.id, now))!
    const later = new Date(now.getTime() + 16 * 60 * 1000)
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const error = new Error('provider failure')
    const compensation = compensateCopyrightActionFailure(
      old,
      now,
      {
        placementId: old.placement_id,
        revision: old.expected_placement_revision,
        imageId: old.image_id,
      },
      getCopyrightActionDeliveryDependencies({
        prepublishImagePlacementDenial: async () => {
          entered.resolve()
          await resume.promise
        },
      }),
      error,
    ).catch(caught => caught)
    try {
      await Promise.race([
        entered.promise,
        compensation.then(() => {
          throw new Error('Compensation ended before denial')
        }),
      ])
      expect(await claimCopyrightActionIntent(intent.id, later)).toBeNull()
    } finally {
      resume.resolve()
      expect(await compensation).toBe(error)
    }
    const current = (await claimCopyrightActionIntent(intent.id, later))!
    expect(current.lease_token).not.toBe(old.lease_token)
  })

  it.each(['complete', 'fail'])(
    'preserves the new enforcement result after stale %s',
    async outcome => {
      const { assessment } = await createCopyrightRestorationHoldFixture()
      await expect(
        processCopyrightEnforcementRequest(assessment.id, {
          imposeRestriction: async input => {
            await expireTestCopyrightEnforcementClaim(assessment.id)
            const reclaimed = await claimCopyrightEnforcementRequest(assessment.id)
            expect(reclaimed).toBeTypeOf('object')
            if (outcome === 'fail') throw new Error('stalled owner resumed')
            return acceptCopyrightNoticeAndImposeRestriction(input)
          },
        }),
      ).rejects.toThrow(
        outcome === 'fail'
          ? 'stalled owner resumed'
          : 'Copyright enforcement request still has unrestricted targets',
      )
      expect(await readCopyrightEnforcementRequest(assessment.id)).toEqual({
        state: 'claimed',
        completed_at: null,
      })
      expect(await claimCopyrightEnforcementRequest(assessment.id)).toBeNull()
      expect(
        await completeNonEnforceableCopyrightEnforcementRequest(assessment.id, crypto.randomUUID()),
      ).toBe(false)
      await expireTestCopyrightEnforcementClaim(assessment.id)
      await expect(processCopyrightEnforcementRequest(assessment.id)).resolves.toBe('completed')
      expect(await readCopyrightEnforcementRequest(assessment.id)).toEqual({
        state: 'completed',
        completed_at: expect.any(Date),
      })
    },
  )
})

async function createActionClaimFixture(action: 'withhold' | 'restore' = 'withhold') {
  const { notice, aggregate, assessment, claimant, moderator } =
    await createCopyrightRestorationHoldFixture()
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0]!.id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: moderator.id,
  })
  let now = new Date()
  if (action === 'restore') {
    const opened = await createCounterNoticeRestoreIntent({
      claimant,
      noticeId: notice.id,
      moderator,
      targetId: aggregate.targets[0]!.id,
      restrictionId: restriction.id,
      placementRevision: aggregate.targets[0]!.placement_revision,
    })
    now = opened.now
  }
  const intent = (await getCopyrightNoticePrivateAggregate(notice.id))!.actionIntents.find(
    record => record.action === action,
  )!
  return { notice, intent, now }
}
