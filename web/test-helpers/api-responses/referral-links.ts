import type {
  PrioritizedReferralLink,
  PrioritizedReferralLinksResponse,
  ListResponse,
  ReferralLinkFeedItem,
  ReferralLinkFeedResponse,
  ReferralLinkFeedUser,
  UserReferralLinkWithDetails,
} from '@/types/api-responses'

import { loadWebApiFixture } from './fixture-loader'

export function makeReferralLinkFeedUser(
  overrides: Partial<ReferralLinkFeedUser> = {},
): ReferralLinkFeedUser {
  const fixture = loadWebApiFixture('web.referral-links.feed.default')
  const user = Object.values(fixture.users)[0]!
  return { ...user, ...overrides }
}

export function makeReferralLinkFeedItem(
  overrides: Partial<ReferralLinkFeedItem> = {},
): ReferralLinkFeedItem {
  const fixture = loadWebApiFixture('web.referral-links.feed.default')
  return { ...fixture.results[0]!, ...overrides }
}

export function makeReferralLinkFeedResponse({
  links = [makeReferralLinkFeedItem()],
  users,
}: {
  links?: ReferralLinkFeedItem[]
  users?: Record<string, ReferralLinkFeedUser>
} = {}): ReferralLinkFeedResponse {
  return {
    results: links,
    users:
      users ?? Object.fromEntries(links.map(link => [link.user_id, makeReferralLinkFeedUser()])),
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

export function makeUserReferralLink(
  overrides: Partial<UserReferralLinkWithDetails> = {},
): UserReferralLinkWithDetails {
  const fixture = loadWebApiFixture('web.referral-links.mine.default')
  return { ...fixture.results[0]!, ...overrides }
}

export function makeUserReferralLinksResponse({
  links = [makeUserReferralLink()],
}: {
  links?: UserReferralLinkWithDetails[]
} = {}): ListResponse<UserReferralLinkWithDetails> {
  return {
    results: links,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

export function makePrioritizedReferralLink(
  overrides: Partial<PrioritizedReferralLink> = {},
): PrioritizedReferralLink {
  const fixture = loadWebApiFixture('web.referral-links.prioritized.default')
  return { ...fixture.links[0]!, ...overrides }
}

export function makePrioritizedReferralLinksResponse({
  links = [makePrioritizedReferralLink()],
  users,
}: {
  links?: PrioritizedReferralLink[]
  users?: PrioritizedReferralLinksResponse['users']
} = {}): PrioritizedReferralLinksResponse {
  return {
    links,
    users: users ?? loadWebApiFixture('web.referral-links.prioritized.default').users,
  }
}
