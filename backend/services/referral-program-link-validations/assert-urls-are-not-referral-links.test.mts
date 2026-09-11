import { beforeAll, describe, it, expect } from 'vitest'
import { assertUrlsAreNotReferralLinks } from './assert-urls-are-not-referral-links.mts'
import {
  createSystemUser,
  createReferralProgramFixture,
  createTestUserDirect,
  getTestPenaltiesByUserId,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('assertUrlsAreNotReferralLinks', () => {
  beforeAll(async () => {
    await createSystemUser(MODERATION_SYSTEM_USERNAME)
  })

  it('no-op when urlIds is empty', async () => {
    await expect(assertUrlsAreNotReferralLinks([])).resolves.toBeUndefined()
  })

  it('resolves when no URL matches a referral program rule', async () => {
    const suffix = randomSuffix()
    const hostnameId = await insertTestUrlHostname({
      hostname: `not-referral-${suffix}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://not-referral-${suffix}.example.com/article`,
      hostnameId,
    })

    await expect(assertUrlsAreNotReferralLinks([urlId])).resolves.toBeUndefined()
  }, 60_000)

  it('throws 422 when a URL matches an enabled referral program rule', async () => {
    const suffix = randomSuffix()
    const user = (await createTestUserDirect({ username: `aunrl-${suffix}` })) as PrivateUser
    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: suffix,
      hostname: `aunrl-rule-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    const hostnameId = await insertTestUrlHostname({ hostname: fixture.hostname })
    const urlId = await insertTestUrl({
      url: `https://${fixture.hostname}/ref/abc`,
      hostnameId,
    })

    const error = await assertUrlsAreNotReferralLinks([urlId]).catch(e => e)
    expect(error.status).toBe(422)
    expect(() => {
      throw error
    }).toThrow(/referral/i)
  }, 60_000)

  it('throws 422 when only one URL in the batch is a referral link', async () => {
    const suffix = randomSuffix()
    const fixture = await createReferralProgramFixture({
      randomSuffix: suffix,
      createdById: (await createTestUserDirect({ username: `aunrl-batch-${suffix}` })).id,
      hostname: `aunrl-batch-${suffix}.example.com`,
      pathname: '/ref/%',
    })

    const okHostnameId = await insertTestUrlHostname({
      hostname: `aunrl-batch-ok-${suffix}.example.com`,
    })
    const okUrlId = await insertTestUrl({
      url: `https://aunrl-batch-ok-${suffix}.example.com/article`,
      hostnameId: okHostnameId,
    })

    const refHostnameId = await insertTestUrlHostname({ hostname: fixture.hostname })
    const refUrlId = await insertTestUrl({
      url: `https://${fixture.hostname}/ref/code`,
      hostnameId: refHostnameId,
    })

    const error = await assertUrlsAreNotReferralLinks([okUrlId, refUrlId]).catch(e => e)
    expect(error.status).toBe(422)
    expect(() => {
      throw error
    }).toThrow(/referral/i)
  }, 60_000)

  it('applies penalty to userId when a referral link is found', async () => {
    const suffix = randomSuffix()
    const user = (await createTestUserDirect({
      username: `aunrl-pen-${suffix}`,
    })) as PrivateUser
    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: suffix,
      hostname: `aunrl-pen-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    const hostnameId = await insertTestUrlHostname({ hostname: fixture.hostname })
    const urlId = await insertTestUrl({
      url: `https://${fixture.hostname}/ref/penalty`,
      hostnameId,
    })

    const error = await assertUrlsAreNotReferralLinks([urlId], user.id).catch(e => e)
    expect(error.status).toBe(422)

    const penalties = await getTestPenaltiesByUserId(user.id)
    const attemptPenalty = penalties.find(p => p.reason === 'blocked_hostname_attempt')
    expect(attemptPenalty).toBeDefined()
    expect(attemptPenalty!.user_id).toBe(user.id)
  }, 60_000)

  it('does not apply penalty when userId is not provided', async () => {
    const suffix = randomSuffix()
    const submitter = (await createTestUserDirect({
      username: `aunrl-nopen-sub-${suffix}`,
    })) as PrivateUser
    const fixture = await createReferralProgramFixture({
      createdById: (await createTestUserDirect({ username: `aunrl-nopen-creator-${suffix}` })).id,
      randomSuffix: suffix,
      hostname: `aunrl-nopen-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    const hostnameId = await insertTestUrlHostname({ hostname: fixture.hostname })
    const urlId = await insertTestUrl({
      url: `https://${fixture.hostname}/ref/no-pen`,
      hostnameId,
    })
    // No userId passed — should still reject the URL but not penalize anyone.
    // Verify against a real user who would have been penalized had userId been passed.
    const error = await assertUrlsAreNotReferralLinks([urlId]).catch(e => e)
    expect(error.status).toBe(422)

    const penalties = await getTestPenaltiesByUserId(submitter.id)
    expect(penalties.find(p => p.reason === 'blocked_hostname_attempt')).toBeUndefined()
  }, 60_000)
})
