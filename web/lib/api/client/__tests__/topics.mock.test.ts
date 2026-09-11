import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  createTopicAliases,
  deleteTopicAlias,
  fetchTopicAliases,
  linkTopicAlias,
  mergeTopicAliases,
  unlinkTopicAlias,
} from '../topics'

const mockDelete = vi.mocked(clientApi.delete)
const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('topics client API', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs topic alias merges to the source merge endpoint', async () => {
    const response = {
      topic: { id: 'destination-topic' },
      topic_merge: {
        source_topic_id: 'source-topic',
        destination_topic_id: 'destination-topic',
        moved_aliases: ['source-slug'],
      },
    }
    mockPost.mockResolvedValueOnce(response)

    await expect(mergeTopicAliases('source-topic', 'destination-topic')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/topics/source-topic/merges', {
      destination_id_or_slug: 'destination-topic',
    })
  })

  it('creates topic aliases', async () => {
    const response = { added: [{ id: 'alias-id', alias: 'travel-deals' }] }
    mockPost.mockResolvedValueOnce(response)

    await expect(createTopicAliases('topic-1', 'travel-deals')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/topics/topic-1/aliases', {
      aliases: 'travel-deals',
    })
  })

  it('deletes a topic alias', async () => {
    mockDelete.mockResolvedValueOnce(undefined)

    await expect(deleteTopicAlias('topic-1', 'alias-id')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/topics/topic-1/aliases/alias-id')
  })

  it('links a topic alias', async () => {
    mockPost.mockResolvedValueOnce(undefined)

    await expect(linkTopicAlias('topic-1', 'alias-id')).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/v1/topics/topic-1/aliases/alias-id', {})
  })

  it('unlinks a topic alias', async () => {
    mockDelete.mockResolvedValueOnce(undefined)

    await expect(unlinkTopicAlias('topic-1', 'alias-id')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/topics/topic-1/aliases/alias-id')
  })

  it('fetches topic aliases without pagination options', async () => {
    const response = {
      results: ['alias-one'],
      alias_records: [{ id: 'alias-id-one', alias: 'alias-one' }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    mockGet.mockResolvedValueOnce(response)

    const result = await fetchTopicAliases('topic-1')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic-1/aliases', {
      searchParams: { after: undefined, limit: undefined },
    })
    expect(result).toEqual({ ...response, results: response.alias_records })
  })

  it('fetches topic aliases with cursor pagination options', async () => {
    const response = {
      results: ['alias-two'],
      alias_records: [{ id: 'alias-id-two', alias: 'alias-two' }],
      page_info: { has_next_page: true, end_cursor: 'cursor-2', start_cursor: 'cursor-2' },
    }
    mockGet.mockResolvedValueOnce(response)

    const result = await fetchTopicAliases('topic-1', { after: 'cursor-1', limit: 10 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic-1/aliases', {
      searchParams: { after: 'cursor-1', limit: 10 },
    })
    expect(result).toEqual({ ...response, results: response.alias_records })
  })
})
