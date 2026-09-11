import { describe, it, expect, beforeAll } from 'vitest'
import { containsReferralLinks } from './contains-referral-links.mts'
import {
  createTestUserDirect,
  createReferralProgramFixture,
  disableReferralProgramByTopicId,
  safeUsername,
} from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('containsReferralLinks', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUserDirect({ username: safeUsername('crl') })
    userId = user!.id
  })

  it('empty URL list returns false', async () => {
    const result = await containsReferralLinks([])
    expect(result.has_referral_links).toBe(false)
    expect(result.matched_urls).toEqual([])
  })

  it('URLs not matching any rule return false', async () => {
    const result = await containsReferralLinks([
      'https://unrelated-site.com/page',
      'https://another-site.org/path',
    ])
    expect(result.has_referral_links).toBe(false)
    expect(result.matched_urls).toEqual([])
  })

  it('URL matching exact hostname + pathname returns true', async () => {
    const suffix = randomSuffix()
    const fixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: suffix,
      hostname: `exact-${suffix}.example.com`,
      pathname: '/ref/%',
    })

    const result = await containsReferralLinks([`https://${fixture.hostname}/ref/abc123`])
    expect(result.has_referral_links).toBe(true)
    expect(result.matched_urls).toHaveLength(1)
    expect(result.matched_urls[0]!.url).toBe(`https://${fixture.hostname}/ref/abc123`)
    expect(result.matched_urls[0]!.referral_program_id).toBe(fixture.referralProgramId)
  })

  it('wildcard hostname match', async () => {
    const suffix = randomSuffix()
    await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: suffix,
      hostname: `*.wildcard-${suffix}.example.com`,
      pathname: '/ref/%',
    })

    const result = await containsReferralLinks([
      `https://sub.wildcard-${suffix}.example.com/ref/code`,
    ])
    expect(result.has_referral_links).toBe(true)
    expect(result.matched_urls).toHaveLength(1)
  })

  it('multiple URLs — partial match returns only matched ones', async () => {
    const suffix = randomSuffix()
    const fixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: suffix,
      hostname: `partial-${suffix}.example.com`,
      pathname: '/ref/%',
    })

    const result = await containsReferralLinks([
      'https://no-match.com/page',
      `https://${fixture.hostname}/ref/code`,
      'https://also-no-match.org/path',
    ])
    expect(result.has_referral_links).toBe(true)
    expect(result.matched_urls).toHaveLength(1)
    expect(result.matched_urls[0]!.url).toBe(`https://${fixture.hostname}/ref/code`)
  })

  it('invalid URL strings are skipped gracefully', async () => {
    const result = await containsReferralLinks(['not-a-url', '://broken', ''])
    expect(result.has_referral_links).toBe(false)
    expect(result.matched_urls).toEqual([])
  })

  it('readOnly: false routes through write pool and still returns correct result', async () => {
    const suffix = randomSuffix()
    const fixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: suffix,
      hostname: `readwrite-${suffix}.example.com`,
      pathname: '/ref/%',
    })

    const result = await containsReferralLinks([`https://${fixture.hostname}/ref/abc`], {
      readOnly: false,
    })
    expect(result.has_referral_links).toBe(true)
    expect(result.matched_urls[0]!.url).toBe(`https://${fixture.hostname}/ref/abc`)
  })

  it('disabled referral program rules are not matched', async () => {
    const suffix = randomSuffix()
    // createReferralProgramFixture creates an enabled program
    const fixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: suffix,
      hostname: `disabled-${suffix}.example.com`,
      pathname: '/ref/%',
    })

    // Disable the program
    await disableReferralProgramByTopicId(fixture.referralProgramId)

    const result = await containsReferralLinks([`https://${fixture.hostname}/ref/code`])
    expect(result.has_referral_links).toBe(false)
  })
})
