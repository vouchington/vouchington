// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () => ({ redirect: redirectMock }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

import CommunitiesProxyFollowingRedirect from '../communities/proxy-following/page'
import CommunitiesProxyMutedRedirect from '../communities/proxy-muted/page'
import CommunitiesSavedRedirect from '../communities/saved/page'
import DomainsBlockedRedirect from '../domains/blocked/page'
import DomainsMutedRedirect from '../domains/muted/page'
import PostsFollowingRedirect from '../posts/following/page'
import PostsHiddenRedirect from '../posts/hidden/page'
import PostsSavedRedirect from '../posts/saved/page'
import RssFeedItemsHiddenRedirect from '../rss-feed-items/hidden/page'
import RssFeedItemsSavedRedirect from '../rss-feed-items/saved/page'
import RssFeedItemsViewedRedirect from '../rss-feed-items/viewed/page'
import RssFeedsMutedRedirect from '../rss-feeds/muted/page'
import TopicsBlockedRedirect from '../topics/blocked/page'
import TopicsDismissedRecommendationsRedirect from '../topics/dismissed-recommendations/page'
import TopicsMutedRedirect from '../topics/muted/page'
import TopicsViewedRedirect from '../topics/viewed/page'
import UrlsSavedRedirect from '../urls/saved/page'
import UsersBlockedRedirect from '../users/blocked/page'
import UsersDismissedRecommendationsRedirect from '../users/dismissed-recommendations/page'
import UsersMutedRedirect from '../users/muted/page'

type RedirectPage = () => void

const CASES: Array<[string, RedirectPage, string]> = [
  [
    'communities/proxy-following',
    CommunitiesProxyFollowingRedirect,
    '/my/communities/proxy-following',
  ],
  ['communities/proxy-muted', CommunitiesProxyMutedRedirect, '/my/communities/proxy-muted'],
  ['communities/saved', CommunitiesSavedRedirect, '/my/communities/saved'],
  ['domains/blocked', DomainsBlockedRedirect, '/my/domains/blocked'],
  ['domains/muted', DomainsMutedRedirect, '/my/domains/muted'],
  ['posts/following', PostsFollowingRedirect, '/my/posts/following'],
  ['posts/hidden', PostsHiddenRedirect, '/my/posts/hidden'],
  ['posts/saved', PostsSavedRedirect, '/my/posts/saved'],
  ['rss-feed-items/hidden', RssFeedItemsHiddenRedirect, '/my/news-items/hidden'],
  ['rss-feed-items/saved', RssFeedItemsSavedRedirect, '/my/news-items/saved'],
  ['rss-feed-items/viewed', RssFeedItemsViewedRedirect, '/my/news-items/viewed'],
  ['rss-feeds/muted', RssFeedsMutedRedirect, '/my/news-sources/muted'],
  ['topics/blocked', TopicsBlockedRedirect, '/my/topics/blocked'],
  [
    'topics/dismissed-recommendations',
    TopicsDismissedRecommendationsRedirect,
    '/my/topics/dismissed-recommendations',
  ],
  ['topics/muted', TopicsMutedRedirect, '/my/topics/muted'],
  ['topics/viewed', TopicsViewedRedirect, '/my/topics/viewed'],
  ['urls/saved', UrlsSavedRedirect, '/my/urls/saved'],
  ['users/blocked', UsersBlockedRedirect, '/my/users/blocked'],
  [
    'users/dismissed-recommendations',
    UsersDismissedRecommendationsRedirect,
    '/my/users/dismissed-recommendations',
  ],
  ['users/muted', UsersMutedRedirect, '/my/users/muted'],
]

describe('user/[id] private-route redirects', () => {
  beforeEach(() => redirectMock.mockClear())

  it.each(CASES)('%s redirects to %s', (_route, fn, target) => {
    fn()
    expect(redirectMock).toHaveBeenCalledWith(target)
  })
})
