import { describe, expect, it, vi } from 'vitest'

const { mockTranslate } = vi.hoisted(() => ({
  mockTranslate: (key: string) => key,
}))

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => mockTranslate,
}))

import { generateMetadata as articles } from '@/app/(posts)/articles/page'
import { generateMetadata as blog } from '@/app/(posts)/blog/page'
import { generateMetadata as dataPoints } from '@/app/(posts)/data-points/page'
import { generateMetadata as discussions } from '@/app/(posts)/discussions/page'
import { generateMetadata as links } from '@/app/(posts)/links/page'
import { generateMetadata as posts } from '@/app/(posts)/posts/page'
import { generateMetadata as reviews } from '@/app/(posts)/reviews/page'
import { generateMetadata as stories } from '@/app/(posts)/stories/page'
import { generateMetadata as cards } from '@/app/(topics)/cards/page'
import { generateMetadata as instances } from '@/app/(topics)/instances/page'
import { generateMetadata as referralPrograms } from '@/app/(topics)/referral-programs/page'
import { generateMetadata as rewardsPrograms } from '@/app/(topics)/rewards-programs/page'
import { generateMetadata as rewardsStatuses } from '@/app/(topics)/rewards-program-statuses/page'
import { generateMetadata as spendingCategories } from '@/app/(topics)/spending-categories/page'
import { generateMetadata as topics } from '@/app/(topics)/topics/page'
import { generateMetadata as feedNews } from '@/app/feed/news/page'
import { generateMetadata as feedNewsFriends } from '@/app/feed/news/friends/page'
import { generateMetadata as feedNewsSources } from '@/app/feed/news/sources/page'
import { generateMetadata as feedNewsTopics } from '@/app/feed/news/topics/page'
import { generateMetadata as feedPodcasts } from '@/app/feed/podcasts/page'
import { generateMetadata as feedPodcastsFriends } from '@/app/feed/podcasts/friends/page'
import { generateMetadata as feedPodcastsSources } from '@/app/feed/podcasts/sources/page'
import { generateMetadata as feedPodcastsTopics } from '@/app/feed/podcasts/topics/page'
import { generateMetadata as feedPosts } from '@/app/feed/posts/page'
import { generateMetadata as feedPostsFriends } from '@/app/feed/posts/friends/page'
import { generateMetadata as feedPostsTopics } from '@/app/feed/posts/topics/page'
import { generateMetadata as feedReferralLinks } from '@/app/feed/referral-links/page'
import { generateMetadata as feedReferralMutual } from '@/app/feed/referral-links/mutual/page'
import { generateMetadata as feedVideos } from '@/app/feed/videos/page'
import { generateMetadata as feedVideosFriends } from '@/app/feed/videos/friends/page'
import { generateMetadata as feedVideosSources } from '@/app/feed/videos/sources/page'
import { generateMetadata as feedVideosTopics } from '@/app/feed/videos/topics/page'

const generators = [
  articles,
  blog,
  dataPoints,
  discussions,
  links,
  posts,
  reviews,
  stories,
  cards,
  instances,
  referralPrograms,
  rewardsPrograms,
  rewardsStatuses,
  spendingCategories,
  topics,
  feedNews,
  feedNewsFriends,
  feedNewsSources,
  feedNewsTopics,
  feedPodcasts,
  feedPodcastsFriends,
  feedPodcastsSources,
  feedPodcastsTopics,
  feedPosts,
  feedPostsFriends,
  feedPostsTopics,
  feedReferralLinks,
  feedReferralMutual,
  feedVideos,
  feedVideosFriends,
  feedVideosSources,
  feedVideosTopics,
]

describe('listing generateMetadata', () => {
  it('localizes titles through getTranslations', async () => {
    const metadata = await Promise.all(generators.map(generate => generate()))
    expect(metadata).toHaveLength(generators.length)
    for (const entry of metadata) {
      expect(String(entry.title ?? '')).not.toBe('')
    }
  })
})
