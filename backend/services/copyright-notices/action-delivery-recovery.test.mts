import { describe, expect, it } from 'vitest'
import { completeTestCopyrightActionClaim } from '@voucha/test-helpers/copyright-lease-fencing'
import { expireTestCopyrightDeliveryIntentClaim } from '@voucha/test-helpers/data-stores/psql/copyright-delivery-claims'
import {
  readTestOwnedCopyrightSweepIds,
  readTestOwnedCopyrightSweepOrder,
} from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  claimCopyrightActionIntent,
  failCopyrightActionIntent,
  searchRecoverableCopyrightActionIntentIds,
} from './action-delivery-state.mts'
import {
  claimCopyrightDeliveryIntent,
  createCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentFailed,
  markCopyrightDeliveryIntentSent,
} from './delivery-intents.mts'
import { searchRecoverableCopyrightDeliveryIntentIds } from './delivery-intent-recovery.mts'
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

function readRecoverableIntentIds(intentId: string, now: Date): Promise<string[]> {
  return readTestOwnedCopyrightSweepIds(
    options => searchRecoverableCopyrightActionIntentIds({ ...options, now }),
    intentId,
  )
}

async function createWithholdActionIntent() {
  const { aggregate, assessment, moderator, notice } = await createCopyrightRestorationHoldFixture()
  await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0]!.id,
    assessmentId: assessment.id,
    imposedAt: new Date(),
    imposedById: moderator.id,
  })
  const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
  const intent = restricted!.actionIntents.find(record => record.action === 'withhold')!
  return { noticeId: notice.id, intent }
}

describe('copyright action delivery recovery', () => {
  it('lists a pending intent, skips its live claim, and relists it once the lease expires', async () => {
    const { intent } = await createWithholdActionIntent()
    const now = new Date()
    await expect(readRecoverableIntentIds(intent.id, now)).resolves.toEqual([intent.id])

    await expect(claimCopyrightActionIntent(intent.id, now)).resolves.not.toBeNull()

    await expect(readRecoverableIntentIds(intent.id, now)).resolves.toEqual([])
    const leaseExpired = new Date(now.getTime() + 5 * 60 * 1000 + 1000)
    await expect(readRecoverableIntentIds(intent.id, leaseExpired)).resolves.toEqual([intent.id])
  })

  it('orders due action work items by id, skips future or terminal rows, and keeps terminal available_at unchanged', async () => {
    const first = await createWithholdActionIntent()
    const backedOff = await createWithholdActionIntent()
    const second = await createWithholdActionIntent()
    const completed = await createWithholdActionIntent()
    const claimed = await createWithholdActionIntent()
    const now = new Date()

    const backedOffClaim = (await claimCopyrightActionIntent(backedOff.intent.id, now))!
    expect(
      await failCopyrightActionIntent({
        intentId: backedOff.intent.id,
        leaseToken: backedOffClaim.lease_token,
        failedAt: now,
        failureMessage: 'temporary edge error',
      }),
    ).toBe('retrying')

    const completedClaim = (await claimCopyrightActionIntent(completed.intent.id, now))!
    const preComplete = (await getCopyrightNoticePrivateAggregate(
      completed.noticeId,
    ))!.actionIntents.find(row => row.id === completed.intent.id)!
    await completeTestCopyrightActionClaim(
      completed.intent.id,
      completedClaim.lease_token,
      new Date(now.getTime() + 1_000),
    )
    const postComplete = (await getCopyrightNoticePrivateAggregate(
      completed.noticeId,
    ))!.actionIntents.find(row => row.id === completed.intent.id)!
    expect(postComplete.state).toBe('completed')
    expect(postComplete.available_at).toEqual(preComplete.available_at)

    await expect(claimCopyrightActionIntent(claimed.intent.id, now)).resolves.not.toBeNull()

    const ownedIds = [
      first.intent.id,
      backedOff.intent.id,
      second.intent.id,
      completed.intent.id,
      claimed.intent.id,
    ]
    const dueNow = await readTestOwnedCopyrightSweepOrder(
      options => searchRecoverableCopyrightActionIntentIds({ ...options, now }),
      ownedIds,
    )
    expect(dueNow).toEqual([first.intent.id, second.intent.id].toSorted())
    await expect(claimCopyrightActionIntent(backedOff.intent.id, now)).resolves.toBeNull()
    await expect(claimCopyrightActionIntent(completed.intent.id, now)).resolves.toBeNull()

    const leaseExpired = new Date(now.getTime() + 5 * 60 * 1000 + 2_000)
    const backedOffAgain = (await claimCopyrightActionIntent(backedOff.intent.id, leaseExpired))!
    expect(
      await failCopyrightActionIntent({
        intentId: backedOff.intent.id,
        leaseToken: backedOffAgain.lease_token,
        failedAt: leaseExpired,
        failureMessage: 'still backed off',
      }),
    ).toBe('retrying')

    const dueAfterExpiry = await readTestOwnedCopyrightSweepOrder(
      options => searchRecoverableCopyrightActionIntentIds({ ...options, now: leaseExpired }),
      ownedIds,
    )
    expect(dueAfterExpiry).toEqual(
      [first.intent.id, second.intent.id, claimed.intent.id].toSorted(),
    )
    await expect(claimCopyrightActionIntent(first.intent.id, leaseExpired)).resolves.not.toBeNull()
  })

  it('orders due delivery work items by id and skips backed-off, live-claimed, and sent rows', async () => {
    const { claimant, notice } = await createCopyrightRestorationHoldFixture()
    const makeDelivery = () =>
      createCopyrightDeliveryIntent({
        noticeId: notice.id,
        submissionId: null,
        correspondenceId: null,
        recipientUserId: claimant.id,
        recipientRole: 'claimant',
        deliveryKind: 'status_update',
        channel: 'in_app',
        idempotencyKey: `recovery-order-${crypto.randomUUID()}`,
      })
    const first = await makeDelivery()
    const backedOff = await makeDelivery()
    const expired = await makeDelivery()
    const sent = await makeDelivery()
    const live = await makeDelivery()

    const backedOffClaim = (await claimCopyrightDeliveryIntent(backedOff.id))!
    expect(
      await markCopyrightDeliveryIntentFailed({
        intentId: backedOff.id,
        leaseToken: backedOffClaim.lease_token,
        error: 'temporary transport error',
      }),
    ).toBe(true)

    await expect(claimCopyrightDeliveryIntent(expired.id)).resolves.not.toBeNull()
    await expireTestCopyrightDeliveryIntentClaim(expired.id, 1)

    const sentClaim = (await claimCopyrightDeliveryIntent(sent.id))!
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId: sent.id,
        leaseToken: sentClaim.lease_token,
      }),
    ).toBe(true)

    await expect(claimCopyrightDeliveryIntent(live.id)).resolves.not.toBeNull()

    const ordered = await readTestOwnedCopyrightSweepOrder(
      options => searchRecoverableCopyrightDeliveryIntentIds({ ...options, channel: 'in_app' }),
      [first.id, backedOff.id, expired.id, sent.id, live.id],
    )
    expect(ordered).toEqual([first.id, expired.id].toSorted())
    await expect(claimCopyrightDeliveryIntent(backedOff.id)).resolves.toBeNull()
    await expect(claimCopyrightDeliveryIntent(sent.id)).resolves.toBeNull()
    await expect(claimCopyrightDeliveryIntent(first.id)).resolves.not.toBeNull()
  })
})
