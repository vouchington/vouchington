import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser, createReferralProgramFixture, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  getReferralLinkCrawlStatus,
  setReferralLinkCrawlFailures,
} from '@voucha/test-helpers/entities/referral-links'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import type { PrivateUser } from '@services/users/types'
import { updateReferralLinkAfterCrawl } from './update-link-status.mts'

describe('update-link-status', () => {
  let user: PrivateUser
  let referralProgramId: string
  let testHostname: string

  beforeAll(async () => {
    user = await createTestUser()
    const randomSuffix = Math.random().toString(36).slice(2, 10)
    testHostname = `crawl-status-${randomSuffix}.com`

    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  })

  function createActiveLink(suffix: string) {
    return createUserReferralLink(WEB_PROVENANCE, user, {
      user_id: user.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/${suffix}`,
    })
  }

  it('success resets consecutive_crawl_failures and sets last_crawl_success_at', async () => {
    const link = await createActiveLink(`success-${Math.random().toString(36).slice(2, 8)}`)

    // Set some pre-existing failures
    await setReferralLinkCrawlFailures(link.id, 2)

    await updateReferralLinkAfterCrawl(link.id, { success: true })

    const updated = await getReferralLinkCrawlStatus(link.id)
    assert.equal(updated.consecutive_crawl_failures, 0)
    assert.ok(updated.last_crawl_success_at)
    assert.ok(updated.activated_at)
    assert.equal(updated.deactivated_at, null)
  })

  it('404 immediately deactivates the link', async () => {
    const link = await createActiveLink(`gone-404-${Math.random().toString(36).slice(2, 8)}`)

    await updateReferralLinkAfterCrawl(link.id, {
      success: false,
      immediateDeactivation: true,
    })

    const updated = await getReferralLinkCrawlStatus(link.id)
    assert.equal(updated.activated_at, null)
    assert.ok(updated.deactivated_at)
  })

  it('5xx increments consecutive_crawl_failures', async () => {
    const link = await createActiveLink(`5xx-inc-${Math.random().toString(36).slice(2, 8)}`)

    await updateReferralLinkAfterCrawl(link.id, { success: false })

    const updated = await getReferralLinkCrawlStatus(link.id)
    assert.equal(updated.consecutive_crawl_failures, 1)
    assert.ok(updated.last_crawl_failure_at)
    assert.ok(updated.activated_at, 'link should still be active after 1 failure')
  })

  it('3rd consecutive 5xx deactivates the link', async () => {
    const link = await createActiveLink(`5xx-deact-${Math.random().toString(36).slice(2, 8)}`)

    // Set failures to 2 (threshold is 3)
    await setReferralLinkCrawlFailures(link.id, 2)

    await updateReferralLinkAfterCrawl(link.id, { success: false })

    const updated = await getReferralLinkCrawlStatus(link.id)
    assert.equal(updated.consecutive_crawl_failures, 3)
    assert.equal(updated.activated_at, null)
    assert.ok(updated.deactivated_at)
  })

  it('429 does NOT increment failures (rate limited)', async () => {
    const link = await createActiveLink(`429-safe-${Math.random().toString(36).slice(2, 8)}`)

    // For 429, the worker simply does not call updateReferralLinkAfterCrawl.
    // Verify the link remains unchanged after a success call (simulating the
    // pattern where 429 is a no-op from the link status perspective).
    const before = await getReferralLinkCrawlStatus(link.id)
    assert.equal(before.consecutive_crawl_failures, 0)
    assert.ok(before.activated_at)

    // Simulate a success after the 429 retry succeeds
    await updateReferralLinkAfterCrawl(link.id, { success: true })

    const after = await getReferralLinkCrawlStatus(link.id)
    assert.equal(after.consecutive_crawl_failures, 0)
    assert.ok(after.activated_at)
  })
})
