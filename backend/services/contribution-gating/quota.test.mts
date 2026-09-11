import { describe, it, expect } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { assertWithinContributionQuota, getContributionQuota } from './quota.mts'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import { resetContributionQuota } from '@voucha/test-helpers'

describe('assertWithinContributionQuota', () => {
  it('allows admins regardless of quota', async () => {
    const userId = uuidv7()
    // Even with no quota, admins always pass
    await expect(assertWithinContributionQuota(userId, true, null)).resolves.toBeUndefined()
  })

  it('increments counter and allows when under limit', async () => {
    const userId = uuidv7()
    await resetContributionQuota(userId)
    await expect(assertWithinContributionQuota(userId, false, null)).resolves.toBeUndefined()
  })

  it('throws CONTRIBUTION_QUOTA_EXCEEDED when free limit is exceeded', async () => {
    const userId = uuidv7()
    await resetContributionQuota(userId)

    // Free limit is 10 — all 10 calls succeed
    for (let i = 0; i < 10; i++) {
      await assertWithinContributionQuota(userId, false, null)
    }

    // 11th call should be rejected (count 11 >= threshold 11)
    await expect(assertWithinContributionQuota(userId, false, null)).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
  })

  it('allows plus members up to their higher limit', async () => {
    const userId = uuidv7()
    await resetContributionQuota(userId)

    // Plus limit is 50 — do 11 calls (would fail for free, should pass for plus)
    for (let i = 0; i < 11; i++) {
      await expect(assertWithinContributionQuota(userId, false, 'plus')).resolves.toBeUndefined()
    }
  })
})

describe('getContributionQuota', () => {
  it('returns limit -1 for admin users', async () => {
    const userId = uuidv7()
    const quota = await getContributionQuota(userId, true, null)
    expect(quota.limit).toBe(-1)
  })

  it('returns correct limit for free users', async () => {
    const userId = uuidv7()
    await resetContributionQuota(userId)
    const quota = await getContributionQuota(userId, false, null)
    expect(quota.limit).toBe(10)
    expect(typeof quota.used).toBe('number')
  })

  it('returns correct limit for plus members', async () => {
    const userId = uuidv7()
    const quota = await getContributionQuota(userId, false, 'plus')
    expect(quota.limit).toBe(50)
  })

  it('returns correct limit for pro members', async () => {
    const userId = uuidv7()
    const quota = await getContributionQuota(userId, false, 'pro')
    expect(quota.limit).toBe(100)
  })
})
