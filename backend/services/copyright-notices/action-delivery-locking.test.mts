import {
  readTestCopyrightDeliveryAttempts,
  rewriteTestCopyrightDeliveryAttempt,
} from '@voucha/test-helpers/copyright-attempt-history'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { describe, expect, it } from 'vitest'
import {
  completeTestCopyrightActionClaim,
  createTestUnreadableCopyrightResponse,
  readTestCopyrightResponseFailure,
  createTestRejectedCopyrightResponse,
} from '@voucha/test-helpers/copyright-lease-fencing'
import { expireTestCopyrightDeliveryIntentClaim } from '@voucha/test-helpers/data-stores/psql/copyright-delivery-claims'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  createCounterNoticeRestoreIntent,
  createCopyrightRestorationHoldFixture,
} from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import {
  markCopyrightDeliveryIntentSent,
  markCopyrightDeliveryIntentFailed,
  prepareCopyrightEmailDelivery,
  enforceCopyrightAssessment,
} from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import { claimCopyrightDeliveryIntent, createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { claimCopyrightActionIntent, failCopyrightActionIntent } from './action-delivery-state.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import { executeCopyrightActionIntent } from './action-delivery-execution.mts'
import { getCopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'

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
    expect(await readTestCopyrightDeliveryAttempts(intent.id)).toEqual([
      { attempt_number: 1, generation: '1', sent: false, failed: false, abandoned: true },
      { attempt_number: 2, generation: '1', sent: true, failed: false, abandoned: false },
    ])
    await expect(rewriteTestCopyrightDeliveryAttempt(intent.id)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('rejects the reclaimed intake reply owner completion and failure', async () => {
    const intentId = await createTestRejectedCopyrightResponse()
    const old = await prepareCopyrightEmailDelivery(intentId)
    await expireTestCopyrightDeliveryIntentClaim(intentId, 1)
    const current = await prepareCopyrightEmailDelivery(intentId)
    expect(current.leaseToken).not.toBe(old.leaseToken)
    expect(
      await markCopyrightDeliveryIntentFailed({
        intentId,
        leaseToken: old.leaseToken,
        error: 'late',
      }),
    ).toBe(false)
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId,
        leaseToken: old.leaseToken,
        sesMessageId: 'late',
      }),
    ).toBe(false)
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId,
        leaseToken: current.leaseToken,
        sesMessageId: crypto.randomUUID(),
      }),
    ).toBe(true)
    expect(
      await markCopyrightDeliveryIntentFailed({
        intentId,
        leaseToken: old.leaseToken,
        error: 'late',
      }),
    ).toBe(false)
  })

  it('records an owned retry failure when intake reply preparation cannot decrypt', async () => {
    const intentId = await createTestUnreadableCopyrightResponse()
    await expect(prepareCopyrightEmailDelivery(intentId)).rejects.toThrow(
      'Invalid encrypted secret format',
    )
    expect(await readTestCopyrightResponseFailure(intentId)).toEqual({
      state: 'pending',
      leaseToken: null,
      claimedAt: null,
      attempts: 1,
      nextAttemptAt: expect.any(Date),
      failure: 'Invalid encrypted secret format',
    })
    await expect(prepareCopyrightEmailDelivery(intentId)).rejects.toThrow(
      'Copyright delivery intent is not available to send',
    )
  })

  it('rejects reclaimed action completion, failure, and execution before side effects', async () => {
    const { notice, intent } = await createActionClaimFixture()
    const now = new Date()
    const old = (await claimCopyrightActionIntent(intent.id, now))!
    const later = new Date(now.getTime() + 16 * 60 * 1000)
    const current = (await claimCopyrightActionIntent(intent.id, later))!
    expect(current.lease_token).not.toBe(old.lease_token)
    await expect(
      completeTestCopyrightActionClaim(intent.id, old.lease_token, later),
    ).rejects.toThrow('lease expired')
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
    ).catch(err => err)
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
    'keeps the concurrent enforcer result when the first enforcer then %ss',
    async outcome => {
      const { assessment, notice } = await createCopyrightRestorationHoldFixture()
      await expect(
        enforceCopyrightAssessment(assessment.id, {
          imposeRestriction: async input => {
            await enforceCopyrightAssessment(assessment.id)
            if (outcome === 'fail') throw new Error('stalled owner resumed')
            return acceptCopyrightNoticeAndImposeRestriction(input)
          },
        }),
      ).resolves.toBeUndefined()
      expect(await countCopyrightActiveRestrictionsForNotice(notice.id)).toBe(1)
      await enforceCopyrightAssessment(assessment.id)
      expect(await countCopyrightActiveRestrictionsForNotice(notice.id)).toBe(1)
    },
  )

  it('rethrows an imposition failure that leaves the target owed', async () => {
    const { assessment, notice } = await createCopyrightRestorationHoldFixture()
    await expect(
      enforceCopyrightAssessment(assessment.id, {
        imposeRestriction: async () => {
          throw new Error('provider outage')
        },
      }),
    ).rejects.toThrow('provider outage')
    expect(await countCopyrightActiveRestrictionsForNotice(notice.id)).toBe(0)
    await enforceCopyrightAssessment(assessment.id)
    expect(await countCopyrightActiveRestrictionsForNotice(notice.id)).toBe(1)
  })
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
