import { EMPTY_RESULTS, type SearchResults } from '@/components/command-search-data'
import { communities } from '@/storybook/entities/fixtures/communities'
import { hostnames } from '@/storybook/entities/fixtures/hostnames'
import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { Community } from '@/types/api-responses'
import type { FediverseSearchResult } from '@/types/fediverse-search'
import type { RssFeedItem } from '@/types/rss-feed-items'

const searchTopics = topics.slice(0, 3)
const searchPosts = posts.flatMap(post =>
  post.post_type === 'review' || post.post_type === 'data_point'
    ? [
        {
          id: post.id,
          post_type: post.post_type,
          title: post.title,
          markdown: post.markdown,
          declared_language: 'en' as const,
          lingua_rs_detected_language: 'en' as const,
        },
      ]
    : [],
)

const newsItem = {
  __entity_type: 'rss_feed_item',
  id: 'news-sapphire-fee',
  published_at: '2026-09-20T12:00:00.000Z',
  lingua_rs_detected_language: 'en',
  data: {
    link: 'https://fintech.example/sapphire-reserve-fee',
    guid: 'sapphire-fee',
    title: 'Sapphire Reserve annual fee changes for 2026',
  },
  url: { id: 'url-sapphire-fee', url: 'https://fintech.example/sapphire-reserve-fee' },
  rss_feed: {
    __entity_type: 'rss_feed',
    id: 'feed-fintech-daily',
    title: 'Fintech Daily',
    is_discoverable: true,
    topic: {
      id: 'topic-open-banking',
      name: 'Open Banking',
      slug: 'open-banking',
      topic_type: 'topic',
    },
    feed_type: 'article',
  },
  rss_feed_sources: [],
  categories: [],
} as RssFeedItem

const fediverseItem: FediverseSearchResult = {
  provider: 'mastodon',
  result_type: 'post',
  source_hostname: 'mastodon.example',
  external_url: 'https://mastodon.example/@alex/sapphire-reserve',
  title: 'Approved for Sapphire Reserve with a 720 score',
  summary: 'Instant decision after linking the bank account used for income verification.',
  author_name: 'Alex Morgan',
  author_url: 'https://mastodon.example/@alex',
  published_at: '2026-09-18T12:00:00.000Z',
}

export const searchResults: SearchResults = {
  topics: searchTopics,
  posts: searchPosts,
  news: [newsItem],
  domains: hostnames.slice(0, 2),
  communities: communities.map(community => ({
    __entity_type: 'community',
    id: community.id,
    name: community.name,
    slug: community.slug,
    markdown: community.description_markdown,
    visibility: community.visibility,
  })) as unknown as Community[],
  fediverse: [fediverseItem],
}

export const emptySearchResults = EMPTY_RESULTS

export const pageShortcut = {
  href: '/reviews',
  label: 'extracted.intents.productPosts.reviews_84cb7871' as const,
  dataPw: 'search-page-shortcut-reviews',
}
