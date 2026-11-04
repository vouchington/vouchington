import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockAgent, withMockAgentDefaultFetchForTest } from '@voucha/test-helpers/provider-http'
import recording from './hacker-news-algolia-recording.json' with { type: 'json' }
import { fetchHackerNewsReferences } from './hacker-news-algolia.mts'

// All provider responses replay the recording or deliberately adversarial copies of its hits.
// Net connections are disabled; fixture collection is independent of the test run.

async function replay(
  stories: unknown,
  comments: unknown,
  status = 200,
  inputUrl = recording.query,
  searchQuery = recording.search_query,
) {
  const agent = new MockAgent()
  agent.disableNetConnect()
  const pool = agent.get(recording.provider.replace('/api/v1/search', ''))
  for (const [kind, body] of [
    ['story', stories],
    ['comment', comments],
  ] as const) {
    pool
      .intercept({
        path(path) {
          const url = new URL(path, recording.provider)
          return (
            url.pathname === '/api/v1/search' &&
            url.searchParams.get('query') === searchQuery &&
            url.searchParams.get('tags') === kind &&
            url.searchParams.get('restrictSearchableAttributes') ===
              (kind === 'story' ? 'url' : 'comment_text')
          )
        },
        method: 'GET',
      })
      .reply(status, JSON.stringify(body), {
        headers: status === 429 ? { 'retry-after': '3' } : {},
      })
  }
  try {
    const result = await withMockAgentDefaultFetchForTest(agent, () =>
      fetchHackerNewsReferences([{ urlId: 'owned-url', url: inputUrl }]),
    )
    agent.assertNoPendingInterceptors()
    return result[0]!
  } finally {
    await agent.close()
  }
}

describe('Hacker News Algolia lookup', () => {
  afterEach(() => vi.restoreAllMocks())
  it('replays recorded SQLite story links and comment hrefs with decoded entities', async () => {
    const result = await replay(recording.responses.stories, recording.responses.comments)
    expect(result.urlId).toBe('owned-url')
    expect(result.stories.map(story => story.hacker_news_item_id)).toEqual([
      12578028, 16356942, 2822983, 9353080, 41391722, 38256529, 46367225, 17515494,
    ])
    expect(result.comments.map(comment => comment.hacker_news_item_id)).toEqual(
      [
        9977143, 8955934, 7799144, 7434274, 7172511, 669817, 6282205, 6004930, 5888703, 5888652,
      ].toSorted((a, b) => b - a),
    )
    expect(result.stories[0]).toMatchObject({ points: recording.responses.stories.hits[0]!.points })
  })

  it('searches the shared video id and verifies alternate YouTube href identities', async () => {
    const videoId = 'dQw4w9WgXcQ'
    const story = recording.responses.stories.hits[0]!
    const comment = recording.responses.comments.hits[0]!
    const result = await replay(
      { hits: [{ ...story, url: `https://youtu.be/${videoId}` }] },
      {
        hits: [
          {
            ...comment,
            comment_text: `<a href="https://www.youtube.com/embed/${videoId}">video</a>`,
          },
        ],
      },
      200,
      `https://m.youtube.com/watch?v=${videoId}&t=30`,
      videoId,
    )
    expect(result.stories.map(hit => hit.hacker_news_item_id)).toEqual([Number(story.objectID)])
    expect(result.comments.map(hit => hit.hacker_news_item_id)).toEqual([Number(comment.objectID)])
  })

  it('rejects text matches, different hrefs, deleted hits and target story threads', async () => {
    const hit = recording.responses.comments.hits[0]!
    const comments = [
      { ...hit, objectID: '101', comment_text: `<p>${recording.query}</p>` },
      {
        ...hit,
        objectID: '102',
        comment_text: `<a href="https://example.com/other">${recording.query}</a>`,
      },
      { ...hit, objectID: '103', story_url: `${recording.query}?utm_source=hn` },
      { ...hit, objectID: '104', story_id: 9353080, story_url: null },
      { ...hit, objectID: '105', comment_text: null },
      { ...hit, objectID: '106', created_at: 'invalid' },
      { ...hit, objectID: '107', story_id: -1 },
      { ...hit, objectID: '108', story_url: null },
      { ...hit, objectID: '108', story_url: null },
      { ...hit, objectID: '109', comment_text: `<!-- <a href="${recording.query}"> -->` },
      { ...hit, objectID: '110', comment_text: `<script><a href="${recording.query}"></script>` },
      { ...hit, objectID: '111', comment_text: `<a data-href="${recording.query}">link</a>` },
    ]
    const result = await replay(recording.responses.stories, { hits: comments })
    expect(result.comments.map(comment => comment.hacker_news_item_id)).toEqual([108])
  })

  it('orders stories by points and verified comments by date before the writer caps them', async () => {
    const story = recording.responses.stories.hits[0]!
    const comment = recording.responses.comments.hits[0]!
    const result = await replay(
      {
        hits: [
          { ...story, objectID: '101', points: 1 },
          { ...story, objectID: '102', points: 9 },
        ],
      },
      {
        hits: [
          {
            ...comment,
            objectID: '103',
            story_id: 999,
            story_url: null,
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            ...comment,
            objectID: '104',
            story_id: 999,
            story_url: null,
            created_at: '2026-01-03T00:00:00Z',
          },
        ],
      },
    )
    expect(result.stories.map(hit => hit.hacker_news_item_id)).toEqual([102, 101])
    expect(result.comments.map(hit => hit.hacker_news_item_id)).toEqual([104, 103])
  })

  it('skips bare domains and invalid URLs without contacting the provider', async () => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    try {
      await expect(
        withMockAgentDefaultFetchForTest(agent, () =>
          fetchHackerNewsReferences([
            { urlId: 'bare', url: 'https://youtube.com' },
            { urlId: 'invalid', url: 'invalid' },
          ]),
        ),
      ).resolves.toEqual([
        { urlId: 'bare', stories: [], comments: [] },
        { urlId: 'invalid', stories: [], comments: [] },
      ])
    } finally {
      await agent.close()
    }
  })

  it('preserves provider Retry-After in the queue deferral signal', async () => {
    await expect(
      replay(recording.responses.stories, recording.responses.comments, 429),
    ).rejects.toMatchObject({ delayMs: 3000, cause: { status: 429, retryAfterMs: 3000 } })
  })

  it.each([429, 503])('propagates provider HTTP %i for queue retry', async status => {
    await expect(
      replay(recording.responses.stories, recording.responses.comments, status),
    ).rejects.toThrow(status === 429 ? /Rate limit exceeded/ : /503/)
  })

  it('rejects a malformed provider response instead of replacing known references with empty facts', async () => {
    await expect(replay({ hits: null }, recording.responses.comments)).rejects.toThrow(
      'Invalid Algolia search response',
    )
  })
})
