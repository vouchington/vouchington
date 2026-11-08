import { describe, it, expect, beforeAll } from 'vitest'
import { checkReferralLinkInPost } from '../spam-signals.mts'
import { createTestUser, createReferralProgramFixture, safeUsername } from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('checkReferralLinkInPost', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('spam-ref') })
    userId = user!.id
  })

  it('markdown with no links — not flagged', async () => {
    const result = await checkReferralLinkInPost('Just plain text without any URLs.')
    expect(result.signal).toBe('referral_link_in_post')
    expect(result.flagged).toBe(false)
    expect(result.score).toBe(0)
  })

  it('markdown with non-referral links — not flagged', async () => {
    const result = await checkReferralLinkInPost(
      'Check out [this article](https://non-referral-random-domain.com/article) for details.',
    )
    expect(result.flagged).toBe(false)
    expect(result.score).toBe(0)
  })

  it('markdown with referral link — flagged', async () => {
    const suffix = randomSuffix()
    const fixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: suffix,
      hostname: `spam-ref-${suffix}.example.com`,
      pathname: '/ref/%',
    })

    const result = await checkReferralLinkInPost(
      `Use my link: [click here](https://${fixture.hostname}/ref/mycode) to sign up!`,
    )
    expect(result.signal).toBe('referral_link_in_post')
    expect(result.flagged).toBe(true)
    expect(result.score).toBe(1.0)
    expect((result.details as Record<string, unknown>)?.matched_count).toBe(1)
  })
})
