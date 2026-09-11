import { describe, expect, it } from 'vitest'
import type { Topic } from '@services/topics/types'
import type { ViewRssFeed } from '@services/rss-feeds/types'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import type { StoryClusterCandidateRow as CandidateRow } from '@voucha/types/entities/story'
import type { ViewUrl } from '@services/urls/types'
import type { PublicViewHostname, ViewHostname } from '@services/urls-hostnames/types'
import { buildClusteringAgentContent } from './content.mts'

describe('buildClusteringAgentContent', () => {
  it('formats source, title, description, publish time, and existing story IDs', async () => {
    const newItem = makeRssFeedItem({
      id: 'new-item',
      sourceTitle: 'News Source',
      title: 'New Article Title',
      description: 'New article description',
      publishedAt: new Date('2026-06-10T12:00:00.000Z'),
    })
    const candidate = makeRssFeedItem({
      id: 'candidate-item',
      sourceTitle: 'Candidate Source',
      title: 'Candidate Article Title',
      description: 'Candidate article description',
      publishedAt: new Date('2026-06-10T12:05:00.000Z'),
    })

    const result = await buildClusteringAgentContent(newItem, [
      {
        item: candidate,
        candidate: makeCandidateRow(candidate.id, 'story-1'),
      },
    ])

    expect(result.content).toContain('## New Article')
    expect(result.content).toContain('New Article ID: new-item')
    expect(result.content).toContain('Source: News Source')
    expect(result.content).toContain('Title: New Article Title')
    expect(result.content).toContain('Description: New article description')
    expect(result.content).toContain('Published: 2026-06-10T12:00:00.000Z')
    expect(result.content).toContain('## Candidate Articles')
    expect(result.content).toContain('Candidate Article ID: candidate-item')
    expect(result.content).toContain('Source: Candidate Source')
    expect(result.content).toContain('Title: Candidate Article Title')
    expect(result.content).toContain('Description: Candidate article description')
    expect(result.content).toContain('Published: 2026-06-10T12:05:00.000Z')
    expect(result.content).toContain('Existing story ID: story-1')
  })

  it('preserves candidate order when formatting more candidates than the concurrency cap', async () => {
    const candidates = Array.from({ length: 6 }, (_, index) => {
      const item = makeRssFeedItem({
        id: `candidate-${index}`,
        sourceTitle: `Candidate Source ${index}`,
        title: `Candidate Title ${index}`,
        description: `Candidate Description ${index}`,
        publishedAt: new Date(`2026-06-10T12:0${index}:00.000Z`),
      })
      return { item, candidate: makeCandidateRow(item.id, `story-${index}`) }
    })

    const result = await buildClusteringAgentContent(
      makeRssFeedItem({
        id: 'new-item',
        sourceTitle: 'News Source',
        title: 'New Article Title',
        description: 'New article description',
        publishedAt: new Date('2026-06-10T12:00:00.000Z'),
      }),
      candidates,
    )

    for (const { item } of candidates) {
      expect(result.content).toContain(`Candidate Article ID: ${item.id}`)
    }

    for (let index = 0; index < candidates.length - 1; index += 1) {
      expect(
        result.content.indexOf(`Candidate Article ID: ${candidates[index].item.id}`),
      ).toBeLessThan(
        result.content.indexOf(`Candidate Article ID: ${candidates[index + 1].item.id}`),
      )
    }
  })

  it('uses media descriptions when article descriptions are missing', async () => {
    const result = await buildClusteringAgentContent(
      makeRssFeedItem({
        id: 'youtube-item',
        sourceTitle: 'YouTube Source',
        title: 'Video Title',
        description: '<p>&nbsp;</p>',
        mediaDescription: 'Video media description for clustering.',
        publishedAt: new Date('2026-06-10T12:00:00.000Z'),
      }),
      [],
    )

    expect(result.content).toContain('Description: Video media description for clustering.')
  })
})

function makeRssFeedItem(options: {
  id: string
  sourceTitle: string
  title: string
  description: string
  mediaDescription?: string
  publishedAt: Date
}): ViewRssFeedItem {
  return {
    __entity_type: 'rss_feed_item',
    id: options.id,
    guid: options.id,
    published_at: options.publishedAt,
    data: {
      guid: options.id,
      link: `https://example.com/${options.id}`,
      title: options.title,
      description: options.description,
      'media:description': options.mediaDescription,
    },
    rss_feed: makeRssFeed(options.id, options.sourceTitle),
    url: makeUrl(options.id),
    categories: [],
  } satisfies ViewRssFeedItem
}

function makeCandidateRow(id: string, storyId: string | null): CandidateRow {
  return {
    id,
    story_id: storyId,
    story_published_at: null,
    distance: 0.1,
  }
}

function makeRssFeed(id: string, title: string): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    id: `feed-${id}`,
    title,
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'article',
    rss_feed_url: makeUrl(`feed-${id}`),
    home_page_url: null,
    hostname: makePublicHostname(id),
    topic: makeTopic(id),
    publisher_type: null,
  }
}

function makeUrl(id: string): ViewUrl {
  return {
    __entity_type: 'url',
    id: `url-${id}`,
    hostname: makeHostname(id),
    canonical_url_id: null,
    url: `https://example.com/${id}`,
    pathname: `/${id}`,
    search_params: {},
  }
}

function makeHostname(id: string): ViewHostname {
  return {
    __entity_type: 'hostname',
    id: `hostname-${id}`,
    hostname: 'example.com',
    topic_id: null,
    blocked: false,
    crawlable: true,
    skip_web_risk: false,
    link_rel_follow: true,
    votes_score_net: 0,
    votes_count_up: 0,
    votes_count_down: 0,
  }
}

function makePublicHostname(id: string): PublicViewHostname {
  return {
    __entity_type: 'hostname',
    id: `hostname-${id}`,
    hostname: 'example.com',
    topic_id: null,
  }
}

function makeTopic(id: string): Topic {
  const user = {
    __entity_type: 'user',
    id: `user-${id}`,
    roles: [],
  } as const

  return {
    __entity_type: 'topic',
    id: `topic-${id}`,
    name: `Topic ${id}`,
    slug: `topic-${id}`,
    markdown: '',
    aliases: [],
    topic_type: 'topic',
    noindex: false,
    allow_reviews: true,
    created_at: new Date('2026-06-10T00:00:00.000Z'),
    hostname_id: null,
    homepage_url_id: null,
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: user,
    updated_by: user,
  }
}
