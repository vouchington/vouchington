import type { RssFeedItem, RssFeedItemsFeedResponseBody, ViewRssFeed } from './types'
import { now, page_info } from './shared'
import { publicUsers } from './users'
import { topics } from './topics'
import { posts } from './posts'
import { hostnames } from './hostnames'

export const rssFeeds = [0, 1, 2, 3].map(index => ({
  __entity_type: 'rss_feed',
  id: `rss-feed-${index}`,
  title:
    ['Fintech Daily', 'Points Podcast', 'Travel Video Desk', 'Mixed Rewards Wire'][index] ??
    'Fixture Feed',
  is_enabled: index !== 1,
  is_discoverable: index !== 1,
  etag: null,
  last_modified_at: now,
  last_fetched_at: now,
  feed_type: ['article', 'podcast', 'video', 'mixed'][index] ?? 'article',
  rss_feed_url: { id: `rss-url-${index}`, url: `https://feeds.example/${index}.xml` },
  home_page_url: { id: `home-url-${index}`, url: 'https://feeds.example/' },
  hostname: hostnames[2],
  topic: topics[10],
  publisher_type: { id: 'publisher-news', slug: 'news', topic_type: 'topic', name: 'News' },
  // Podcast-specific metadata present only for feed_type='podcast'
  podcast_show:
    index === 1
      ? {
          itunes_author: 'The Points Guy Podcast Network',
          itunes_owner_name: 'Points Guy Media',
          cover_art_url: null,
          is_explicit: false,
          itunes_type: 'episodic',
        }
      : null,
  categories:
    index === 1
      ? [
          { category_text: 'business', topic_id: null, topic_slug: null },
          { category_text: 'news', topic_id: null, topic_slug: null },
        ]
      : [],
})) as unknown as ViewRssFeed[]
export const newsItems = [0, 1, 2, 3].map(index => {
  const feed = rssFeeds[index % rssFeeds.length]!
  return {
    __entity_type: 'rss_feed_item',
    id: `rss-item-${index}`,
    published_at: now,
    data: {
      link: `https://feeds.example/story-${index}`,
      guid: `guid-${index}`,
      title:
        [
          'Bank launches transfer bonus',
          'Weekly points podcast',
          'New lounge review video',
          'Mixed media roundup',
        ][index] ?? 'Fixture news',
      contentSnippet:
        'News fixture with publisher metadata, categories, related posts, and action footer.',
      categories: ['cards', 'travel'],
      media_type:
        feed.feed_type === 'podcast' ? 'audio' : feed.feed_type === 'video' ? 'video' : 'article',
      duration_seconds: feed.feed_type === 'podcast' ? 1800 : undefined,
      video_platform: feed.feed_type === 'video' ? 'youtube' : undefined,
      video_id: feed.feed_type === 'video' ? 'dQw4w9WgXcQ' : undefined,
      'media:description':
        feed.feed_type === 'video'
          ? 'YouTube video description with chapters, source links, and production notes.'
          : undefined,
      'media:starRating':
        feed.feed_type === 'video' ? { average: 5, count: 659, min: 1, max: 5 } : undefined,
      'media:statistics': feed.feed_type === 'video' ? { views: 11_740 } : undefined,
    },
    url: { id: `news-url-${index}`, url: `https://feeds.example/story-${index}` },
    rss_feed: {
      __entity_type: 'rss_feed',
      id: feed.id,
      title: feed.title,
      is_discoverable: feed.is_discoverable,
      topic: feed.topic,
      feed_type: feed.feed_type,
    },
    rss_feed_sources: [],
    categories: [{ id: 'rel-cards', category_text: 'Cards', topic: topics[1], votes_score_net: 1 }],
  }
}) as unknown as RssFeedItem[]
export const newsResponse: RssFeedItemsFeedResponseBody = {
  results: newsItems.map((item, index) => ({
    __entity_type: 'rss_feed_item',
    id: item.id,
    entity_id: item.id,
    published_at: item.published_at,
    ranking: 1,
    story_id: index < 3 ? 'story-transfer-bonus' : null,
  })),
  page_info,
  rss_feed_items: Object.fromEntries(newsItems.map(item => [item.id, item])),
  rss_feed_item_elections: Object.fromEntries(
    newsItems.map((item, index) => [
      item.id,
      {
        __entity_type: 'rss_feed_item_election',
        id: `rss-election-${item.id}`,
        votes_score_net: 10 + index,
        votes_count_up: String(14 + index),
        votes_count_down: String(index),
      },
    ]),
  ),
  stories: {
    'story-transfer-bonus': {
      id: 'story-transfer-bonus',
      title: 'Transfer bonus coverage',
      cluster_reason: 'Multiple feeds covered the same card transfer bonus.',
      published_at: now,
      official_rss_feed_item_id: newsItems[0]!.id,
    },
  },
  story_member_ids: { 'story-transfer-bonus': newsItems.slice(0, 3).map(item => item.id) },
  story_post_ids: { 'story-transfer-bonus': 'post-story' },
  related_posts_by_url_id: {
    [newsItems[0]!.url.id]: [posts[0]!.id, 'post-story'],
    [newsItems[1]!.url.id]: ['post-story'],
  },
  posts: { [posts[0]!.id]: posts[0]!, 'post-story': posts[3]! },
  users: Object.fromEntries(publicUsers.map(user => [user.id, user])),
} as unknown as RssFeedItemsFeedResponseBody
