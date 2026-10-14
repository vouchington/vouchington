import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createPlusSku,
  createObservedRenewingMembership,
  readOwnedRenewalCandidates,
} from '@voucha/test-helpers/renewal-notification-fixtures'
import { RenewalBusinessTime } from './renewal-business-time.mts'
import { prepareRenewalPriceIncreaseNotification } from './renewal-notification-prepare.mts'
import { claimRenewalPriceIncreaseNotification } from './renewal-check.mts'
import { markRenewalPriceIncreaseNotificationDeliveryAttempted } from './renewal-notification-delivery.mts'

const windows = [
  ['month-end millisecond', '2030-01-31T23:59:59.999Z', '2030-03-02T23:59:59.999Z'],
  ['UTC midnight', '2030-02-01T00:00:00.000Z', '2030-03-03T00:00:00.000Z'],
  ['leap-day end boundary', '2032-01-30T23:59:59.999Z', '2032-02-29T23:59:59.999Z'],
] as const
const edges = [
  ['at the exclusive lower boundary', 'start', 0, false],
  ['one millisecond after the lower boundary', 'start', 1, true],
  ['at the inclusive 30-day upper boundary', 'end', 0, true],
  ['one millisecond after the upper boundary', 'end', 1, false],
] as const

describe('renewal business time', () => {
  describe.each(windows)('renewal business window: %s', (_label, nowIso, endIso) => {
    it.each(edges)('%s', async (_edge, anchor, offset, eligible) => {
      const input = new Date(nowIso)
      const time = new RenewalBusinessTime(input)
      input.setUTCFullYear(2040)
      const renewalAt = new Date(Date.parse(anchor === 'start' ? nowIso : endIso) + offset)
      const application = `renewal-window-${randomUUID()}`
      const current = await createPlusSku(500, { provider_application_id: application })
      const increased = await createPlusSku(800, { provider_application_id: application })
      const user = await createTestUser()
      const fixture = await createObservedRenewingMembership(
        user.id,
        current,
        increased,
        application,
        renewalAt,
        new Date(Date.parse(endIso) + 30 * 24 * 60 * 60 * 1000),
      )
      const membershipId = fixture.membership.id
      const observationId = fixture.membership_provider_observation_id
      const candidates = await readOwnedRenewalCandidates(membershipId, time)
      const candidate = candidates.find(row => row.membership_id === membershipId) ?? null
      expect(candidate !== null).toBe(eligible)
      expect(candidate?.membership_id ?? null).toBe(eligible ? membershipId : null)
      expect(candidate?.user_id ?? null).toBe(eligible ? user.id : null)
      const generation = await prepareRenewalPriceIncreaseNotification(
        membershipId,
        user.id,
        observationId,
        time,
      )
      const presentGeneration = expect.any(String)
      expect(generation).toEqual(eligible ? presentGeneration : null)
      const claim =
        generation === null
          ? null
          : await claimRenewalPriceIncreaseNotification(
              membershipId,
              user.id,
              observationId,
              generation,
              time,
            )
      const ownedClaim = expect.objectContaining({ generation, leaseToken: expect.any(String) })
      expect(claim).toEqual(eligible ? ownedClaim : null)
      const attempted =
        claim === null
          ? false
          : await markRenewalPriceIncreaseNotificationDeliveryAttempted(
              membershipId,
              user.id,
              observationId,
              claim,
              time,
            )
      expect(attempted).toBe(eligible)
    })
  })

  it('rejects an invalid business instant before any renewal work', () => {
    expect(() => new RenewalBusinessTime(new Date(Number.NaN))).toThrow(RangeError)
  })

  const revalidations = [
    ['claim', 'at renewal', '2030-03-01T00:00:00.000Z'],
    ['claim', 'before the 30-day window', '2030-01-29T23:59:59.999Z'],
    ['pre-send attempt', 'at renewal', '2030-03-01T00:00:00.000Z'],
    ['pre-send attempt', 'before the 30-day window', '2030-01-29T23:59:59.999Z'],
  ] as const

  it.each(revalidations)(
    '%s revalidates existing owned work %s',
    async (stage, _edge, invalidIso) => {
      const inside = new RenewalBusinessTime(new Date('2030-02-15T00:00:00.000Z'))
      const outside = new RenewalBusinessTime(new Date(invalidIso))
      const application = `renewal-revalidate-${randomUUID()}`
      const current = await createPlusSku(500, { provider_application_id: application })
      const increased = await createPlusSku(800, { provider_application_id: application })
      const user = await createTestUser()
      const fixture = await createObservedRenewingMembership(
        user.id,
        current,
        increased,
        application,
        new Date('2030-03-01T00:00:00.000Z'),
        new Date('2030-05-01T00:00:00.000Z'),
      )
      const membershipId = fixture.membership.id
      const observationId = fixture.membership_provider_observation_id
      const generation = await prepareRenewalPriceIncreaseNotification(
        membershipId,
        user.id,
        observationId,
        inside,
      )
      expect(generation).toEqual(expect.any(String))
      if (generation === null) throw new Error('Valid preparation did not create owned work')
      const firstClaim = await claimRenewalPriceIncreaseNotification(
        membershipId,
        user.id,
        observationId,
        generation,
        stage === 'claim' ? outside : inside,
      )
      const ownedClaim = expect.objectContaining({ generation, leaseToken: expect.any(String) })
      expect(firstClaim).toEqual(stage === 'claim' ? null : ownedClaim)
      const claim =
        stage === 'claim'
          ? await claimRenewalPriceIncreaseNotification(
              membershipId,
              user.id,
              observationId,
              generation,
              inside,
            )
          : firstClaim
      expect(claim).toMatchObject({ generation, leaseToken: expect.any(String) })
      if (claim === null) throw new Error('Valid owned work could not be claimed')
      const attempted = await markRenewalPriceIncreaseNotificationDeliveryAttempted(
        membershipId,
        user.id,
        observationId,
        claim,
        stage === 'claim' ? inside : outside,
      )
      expect(attempted).toBe(stage === 'claim')
      const confirmed =
        attempted ||
        (await markRenewalPriceIncreaseNotificationDeliveryAttempted(
          membershipId,
          user.id,
          observationId,
          claim,
          inside,
        ))
      expect(confirmed).toBe(true)
    },
  )
})
