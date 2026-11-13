import {
  readTestCopyrightDeliveryAttempts,
  rewriteTestCopyrightDeliveryAttempt,
} from '@voucha/test-helpers/copyright-attempt-history'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUnreadableCopyrightResponse,
  readTestCopyrightResponseFailure,
  createTestRejectedCopyrightResponse,
} from '@voucha/test-helpers/copyright-lease-fencing'
import { expireTestCopyrightDeliveryIntentClaim } from '@voucha/test-helpers/data-stores/psql/copyright-delivery-claims'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import {
  markCopyrightDeliveryIntentSent,
  markCopyrightDeliveryIntentFailed,
  prepareCopyrightEmailDelivery,
} from './index.mts'
import { claimCopyrightDeliveryIntent, createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createReclaimedActionFixture } from '@voucha/test-helpers/copyright-reclaimed-action-fixtures'
import {
  assertActionReclaim,
  assertReclaimedActionGuards,
} from '@voucha/test-helpers/copyright-reclaimed-action-subjects'
import {
  assertEnforcerCompletedSibling,
  assertOwedEnforcerFailure,
} from '@voucha/test-helpers/copyright-enforcer-lease-subjects'

// Form screening's reclaimed-owner regression is owned by form-screening-executions.test.mts.
describe('copyright queue lease fencing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

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

  it('reclaims an expired action lease atomically before granting the new owner authority', async () => {
    expect.hasAssertions()
    installTestMediaDeliveryEdge()
    await assertActionReclaim(await createReclaimedActionFixture(false))
  })

  it('rejects reclaimed action completion, failure, and execution before side effects', async () => {
    const edge = installTestMediaDeliveryEdge()
    await assertReclaimedActionGuards(await createReclaimedActionFixture())
    expect(edge.put).not.toHaveBeenCalled()
  })

  it.each(['complete', 'fail'])(
    'keeps the committed sibling enforcer result when the first enforcer then %ss',
    async outcome => {
      expect.hasAssertions()
      const scene = await createCopyrightRestorationHoldFixture()
      await assertEnforcerCompletedSibling(scene, outcome === 'fail')
      expect(await countCopyrightActiveRestrictionsForNotice(scene.notice.id)).toBe(1)
    },
  )

  it('rethrows an imposition failure that leaves the target owed', async () => {
    expect.hasAssertions()
    await assertOwedEnforcerFailure(await createCopyrightRestorationHoldFixture())
  })
})
