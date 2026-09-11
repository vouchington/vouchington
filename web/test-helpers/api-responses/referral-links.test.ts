import { describe, expect, it } from 'vitest'
import {
  makePrioritizedReferralLink,
  makePrioritizedReferralLinksResponse,
  makeReferralLinkFeedItem,
  makeReferralLinkFeedResponse,
  makeReferralLinkFeedUser,
  makeUserReferralLink,
  makeUserReferralLinksResponse,
} from './referral-links'

describe('referral link API response factories', () => {
  it('builds referral link feed responses from shared fixtures', () => {
    const link = makeReferralLinkFeedItem({ id: 'link-2', label: 'Second link' })
    const user = makeReferralLinkFeedUser({ id: link.user_id, username: 'alice' })

    expect(
      makeReferralLinkFeedResponse({ links: [link], users: { [user.id]: user } }),
    ).toMatchObject({
      results: [{ id: 'link-2', label: 'Second link', referral_program_slug: 'test-card' }],
      users: { 'user-1': { username: 'alice' } },
      page_info: { has_next_page: false },
    })
  })

  it('builds signed-in user referral link lists', () => {
    const link = makeUserReferralLink({ id: 'mine-1', deactivated_at: null })

    expect(makeUserReferralLinksResponse({ links: [link] })).toMatchObject({
      results: [{ id: 'mine-1', referral_program_name: 'Test Card', deactivated_at: null }],
      page_info: { has_next_page: false },
    })
  })

  it('builds prioritized referral link responses', () => {
    const link = makePrioritizedReferralLink({ id: 'priority-1', best_score: 9.5 })

    expect(makePrioritizedReferralLinksResponse({ links: [link] })).toMatchObject({
      links: [{ id: 'priority-1', best_score: 9.5, referral_program_id: 'referral-program-1' }],
      users: { 'user-1': { username: 'testuser' } },
    })
  })
})
