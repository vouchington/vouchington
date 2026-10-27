import { beforeAll, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { createReferralProgramFixture, createTestUser } from '@voucha/test-helpers'
import { isUrlReferralLink } from './check.mts'

describe('check (Amex program resolution)', () => {
  const suffix = crypto.randomUUID()
  const cases = [
    { pathname: `/en-us/referral/test-parent-${suffix}` },
    { pathname: `/en-us/referral/personal/test-${suffix}` },
    { pathname: `/en-us/referral/business/test-${suffix}` },
  ]
  let programIds: string[]

  beforeAll(async () => {
    const user = await createTestUser()
    programIds = []
    for (const { pathname } of cases) {
      const program = await createReferralProgramFixture({
        createdById: user.id,
        hostname: '*.americanexpress.com',
        pathname: `${pathname}%`,
      })
      programIds.push(program.referralProgramId)
    }
  })

  it('resolves parent, personal, and business URLs to their own referral programs', async () => {
    for (const [index, { pathname }] of cases.entries()) {
      const result = await isUrlReferralLink(
        `https://www.americanexpress.com${pathname}?ref=abc123`,
      )
      assert.equal(result.is_valid, true)
      assert.equal(result.referral_program_id, programIds[index])
    }
  })

  it('all-cards link resolves to the parent program, not a per-card child program', async () => {
    const result = await isUrlReferralLink(
      `https://www.americanexpress.com${cases[0]!.pathname}?ref=abc123`,
    )
    assert.equal(result.is_valid, true)
    assert.equal(result.referral_program_id, programIds[0])
  })

  it('a per-card link does not fall back to the parent all-cards program', async () => {
    const result = await isUrlReferralLink(
      `https://www.americanexpress.com${cases[1]!.pathname}?ref=abc123`,
    )
    assert.equal(result.is_valid, true)
    assert.equal(result.referral_program_id, programIds[1])
    assert.notEqual(result.referral_program_id, programIds[0])
  })

  it('*.americanexpress.com wildcard matches both the apex and www host', async () => {
    const wwwResult = await isUrlReferralLink(
      `https://www.americanexpress.com${cases[1]!.pathname}?ref=abc123`,
    )
    const apexResult = await isUrlReferralLink(
      `https://americanexpress.com${cases[1]!.pathname}?ref=abc123`,
    )

    assert.equal(wwwResult.is_valid, true)
    assert.equal(apexResult.is_valid, true)
    assert.equal(wwwResult.referral_program_id, programIds[1])
    assert.equal(apexResult.referral_program_id, programIds[1])
  })
})
