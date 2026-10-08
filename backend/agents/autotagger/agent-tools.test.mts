import { describe, expect, it, vi } from 'vitest'
import {
  buildAutotaggerAgentTools,
  parseSubmission,
  runSearchTopicsTool,
  searchTopicsByText,
  type SearchTopics,
} from './agent-tools.mts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('buildAutotaggerAgentTools', () => {
  it('limits the submission to the candidate ids and the search to a bounded query', () => {
    const [search, submit] = buildAutotaggerAgentTools([A, B])

    expect(search).toMatchObject({
      name: 'search_topics',
      inputSchema: { required: ['query'], additionalProperties: false },
    })
    expect(submit).toMatchObject({
      name: 'submit_topics',
      inputSchema: {
        required: ['topic_ids'],
        properties: { topic_ids: { items: { enum: [A, B] }, maxItems: 2, uniqueItems: true } },
      },
    })
  })
})

describe('parseSubmission', () => {
  const candidates = new Set([A, B])

  it('accepts candidate ids once each, and an empty list', () => {
    expect(parseSubmission({ topic_ids: [A, A, B] }, candidates)).toEqual({
      ok: true,
      topicIds: [A, B],
    })
    expect(parseSubmission({ topic_ids: [] }, candidates)).toEqual({ ok: true, topicIds: [] })
  })

  it.each([
    ['no object', null],
    ['no ids', {}],
    ['ids that are not an array', { topic_ids: A }],
    ['a non-string id', { topic_ids: [1] }],
  ])('rejects %s', (_name, input) => {
    expect(parseSubmission(input, candidates)).toMatchObject({
      ok: false,
      error: expect.stringContaining('array'),
    })
  })

  it('rejects an id outside the candidates', () => {
    expect(parseSubmission({ topic_ids: [A, 'other'] }, candidates)).toMatchObject({
      ok: false,
      error: expect.stringContaining('candidate list'),
    })
  })
})

describe('runSearchTopicsTool', () => {
  it('returns sanitized names and marks which hits are candidates', async () => {
    const search = vi.fn<SearchTopics>().mockResolvedValue([
      { id: A, name: 'Rust', slug: 'rust' },
      { id: B, name: 'Go', slug: 'go' },
    ])

    const result = await runSearchTopicsTool({ query: '  lang ' }, new Set([A]), search)

    expect(search).toHaveBeenCalledWith('lang')
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.content) as {
      topics: { id: string; name: string; candidate: boolean }[]
    }
    expect(parsed.topics.map(topic => [topic.id, topic.candidate])).toEqual([
      [A, true],
      [B, false],
    ])
    expect(parsed.topics[0]!.name).toContain('Rust')
    expect(parsed.topics[0]!.name).toContain('external-content')
  })

  it.each([
    ['no query', {}],
    ['an empty query', { query: '   ' }],
    ['a non-string query', { query: 3 }],
    ['no input', null],
  ])('returns an error result for %s without searching', async (_name, input) => {
    const search = vi.fn<SearchTopics>()

    await expect(runSearchTopicsTool(input, new Set(), search)).resolves.toMatchObject({
      isError: true,
    })
    expect(search).not.toHaveBeenCalled()
  })
})

describe('runSearchTopicsTool with an oversized query', () => {
  it('tells the model the length limit instead of calling the search', async () => {
    const search = vi.fn<SearchTopics>()

    await expect(
      runSearchTopicsTool({ query: 'x'.repeat(201) }, new Set(), search),
    ).resolves.toEqual({ content: 'query must be at most 200 characters.', isError: true })
    expect(search).not.toHaveBeenCalled()
  })
})

describe('searchTopicsByText (real PG)', () => {
  it('searches the topic catalog by text and returns at most a handful of hits', async () => {
    const hits = await searchTopicsByText('zzzz-no-such-topic-zzzz')

    expect(hits).toEqual([])
  })
})
