import { describe, expect, it } from 'vitest'
import type { ViewRssFeed } from '@services/rss-feeds/types'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import type { PublicViewHostname, ViewHostname } from '@services/urls-hostnames/types'
import type { ViewUrl } from '@services/urls/types'
import type { Topic } from '@services/topics/types'
import type { StoryClusterCandidateRow } from '@voucha/types/entities/story'
import {
  buildStoryClusteringBindings,
  STORY_CLUSTERING_NONE_KEY,
  STORY_CLUSTERING_QUESTION_ID,
  type StoryClusteringCandidateContent,
} from './choice-clustering-bindings.mts'

const PROMPT = 'Which candidate does the incoming article belong to?'
const INCOMING = makeRssFeedItem({ id: 'incoming-1', title: 'Incoming Title' })

describe('buildStoryClusteringBindings', () => {
  it('binds a story criterion by storyId and an rss_feed_item criterion by item id, plus none', async () => {
    const storyCandidate = makeCandidateContent({
      itemId: 'member-1',
      storyId: 'story-42',
      title: 'A',
    })
    const standaloneCandidate = makeCandidateContent({
      itemId: 'item-b',
      storyId: null,
      title: 'B',
    })

    const result = await buildStoryClusteringBindings({
      incomingItem: INCOMING,
      candidateContent: [storyCandidate, standaloneCandidate],
      promptTemplate: PROMPT,
    })

    expect(result.bindings).toHaveLength(1)
    const [binding] = result.bindings
    expect(binding.type).toBe('choice')
    expect(binding.questionId).toBe(STORY_CLUSTERING_QUESTION_ID)
    expect(binding.question).toBe(PROMPT)
    expect(binding.criteria).toEqual([
      {
        criterion: 'story:story-42',
        candidate: { candidateKind: 'story', storyId: 'story-42', storedCandidateId: null },
      },
      {
        criterion: 'rss_feed_item:item-b',
        candidate: {
          candidateKind: 'rss_feed_item',
          rssFeedItemId: 'item-b',
          storedCandidateId: null,
        },
      },
      { criterion: STORY_CLUSTERING_NONE_KEY, candidate: null },
    ])
  })

  it('renders every candidate criterion key verbatim in the state', async () => {
    const candidates = [
      makeCandidateContent({ itemId: 'item-a', storyId: 'story-a', title: 'A' }),
      makeCandidateContent({ itemId: 'item-b', storyId: null, title: 'B' }),
    ]

    const result = await buildStoryClusteringBindings({
      incomingItem: INCOMING,
      candidateContent: candidates,
      promptTemplate: PROMPT,
    })

    for (const criterion of result.bindings[0].criteria) {
      if (criterion.criterion === STORY_CLUSTERING_NONE_KEY) continue
      expect(result.state).toContain(`Candidate key: ${criterion.criterion}`)
    }
  })

  it('labels the existing story only for a story candidate, never a standalone one', async () => {
    const result = await buildStoryClusteringBindings({
      incomingItem: INCOMING,
      candidateContent: [
        makeCandidateContent({ itemId: 'item-a', storyId: 'story-99', title: 'A' }),
        makeCandidateContent({ itemId: 'item-b', storyId: null, title: 'B' }),
      ],
      promptTemplate: PROMPT,
    })

    expect(result.state).toContain('Existing story: story-99')
    expect(result.state.match(/Existing story:/g)).toHaveLength(1)
  })

  it('falls back to the media description when the article description is blank', async () => {
    const result = await buildStoryClusteringBindings({
      incomingItem: INCOMING,
      candidateContent: [
        makeCandidateContent({
          itemId: 'item-a',
          storyId: null,
          title: 'Video Title',
          description: '<p>&nbsp;</p>',
          mediaDescription: 'Video media description for clustering.',
        }),
      ],
      promptTemplate: PROMPT,
    })

    expect(result.state).toContain('Video media description for clustering.')
  })

  it('throws when given no candidates', async () => {
    await expect(
      buildStoryClusteringBindings({
        incomingItem: INCOMING,
        candidateContent: [],
        promptTemplate: PROMPT,
      }),
    ).rejects.toThrow('Story clustering requires at least one candidate')
  })

  it('rejects a prompt template containing the {{candidate}} placeholder', async () => {
    const candidate = makeCandidateContent({ itemId: 'item-a', storyId: null, title: 'A' })

    await expect(
      buildStoryClusteringBindings({
        incomingItem: INCOMING,
        candidateContent: [candidate],
        promptTemplate: 'Which does {{candidate}} belong to?',
      }),
    ).rejects.toThrow('must not contain a {{candidate}} placeholder')
  })
})

function makeCandidateContent(options: {
  itemId: string
  storyId: string | null
  title: string
  description?: string
  mediaDescription?: string
}): StoryClusteringCandidateContent {
  return {
    candidate: {
      id: options.itemId,
      story_id: options.storyId,
      story_published_at: null,
      distance: 0.1,
    },
    item: makeRssFeedItem({
      id: options.itemId,
      title: options.title,
      description: options.description,
      mediaDescription: options.mediaDescription,
    }),
  } satisfies { candidate: StoryClusterCandidateRow; item: ViewRssFeedItem }
}

function makeRssFeedItem(options: {
  id: string
  title: string
  description?: string
  mediaDescription?: string
}): ViewRssFeedItem {
  const hostname: ViewHostname = {
    __entity_type: 'hostname',
    id: `hostname-${options.id}`,
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
  const publicHostname: PublicViewHostname = {
    __entity_type: 'hostname',
    id: hostname.id,
    hostname: hostname.hostname,
    topic_id: null,
  }
  const url = (suffix: string): ViewUrl => ({
    __entity_type: 'url',
    id: `url-${suffix}`,
    hostname,
    canonical_url_id: null,
    url: `https://example.com/${suffix}`,
    pathname: `/${suffix}`,
    search_params: {},
  })
  const user = { __entity_type: 'user', id: `user-${options.id}`, roles: [] } as const
  const topic: Topic = {
    __entity_type: 'topic',
    id: `topic-${options.id}`,
    name: `Topic ${options.id}`,
    slug: `topic-${options.id}`,
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
  const rssFeed: ViewRssFeed = {
    __entity_type: 'rss_feed',
    id: `feed-${options.id}`,
    title: `Feed ${options.id}`,
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'article',
    rss_feed_url: url(`feed-${options.id}`),
    home_page_url: null,
    hostname: publicHostname,
    topic,
    publisher_type: null,
  }

  return {
    __entity_type: 'rss_feed_item',
    id: options.id,
    guid: options.id,
    published_at: new Date('2026-06-10T12:00:00.000Z'),
    data: {
      guid: options.id,
      link: `https://example.com/${options.id}`,
      title: options.title,
      description: options.description ?? `${options.title} description`,
      'media:description': options.mediaDescription,
    },
    rss_feed: rssFeed,
    url: url(options.id),
    categories: [],
  } satisfies ViewRssFeedItem
}
