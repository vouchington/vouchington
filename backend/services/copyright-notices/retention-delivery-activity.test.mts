import { describe, expect, it } from 'vitest'
import {
  claimCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentSent,
} from './delivery-intents.mts'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  createCopyrightDeliveryActivityFixture,
  readCopyrightDeliveryActivityState,
} from '@voucha/test-helpers/copyright-retention-delivery-activity'

describe('copyright delivery activity retention clock', () => {
  useFakeCopyrightEvidenceBucket()

  it('ignores a lease update and advances on provider acceptance', async () => {
    const fixture = await createCopyrightDeliveryActivityFixture()
    const initial = await readCopyrightDeliveryActivityState(fixture)
    expect(initial.legalClock).toEqual(new Date('2000-01-01T00:00:00.000Z'))
    expect(initial.updatedAt).toEqual(new Date('2000-01-01T00:00:00.000Z'))

    const claimed = await claimCopyrightDeliveryIntent(fixture.deliveryId)
    expect(claimed).not.toBeNull()
    const afterClaim = await readCopyrightDeliveryActivityState(fixture)
    expect(afterClaim.updatedAt.getTime()).toBeGreaterThan(initial.updatedAt.getTime())
    expect(afterClaim.legalClock).toEqual(initial.legalClock)

    expect(
      await markCopyrightDeliveryIntentSent({
        intentId: fixture.deliveryId,
        leaseToken: claimed!.lease_token,
      }),
    ).toBe(true)
    const afterSent = await readCopyrightDeliveryActivityState(fixture)
    expect(afterSent.sentAt).toBeInstanceOf(Date)
    expect(afterSent.legalClock).toEqual(afterSent.sentAt)
    expect(afterSent.legalClock.getTime()).toBeGreaterThan(initial.legalClock.getTime())
  })
})
