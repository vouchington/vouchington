import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFediverseInstance, getFediverseInstances, getFediverseSearch } from '../fediverse'
import { getTopics } from '../topics'
import {
  makeTopic,
  makeTopicMutationResponse,
  makeTopicsSearchResponse,
} from '@/test-helpers/api-responses'

const { mockGet, mockGetTopics } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockGetTopics: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

vi.mock(
  import('../instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('../instance'),
)
vi.mock(import('../topics'), () => ({ getTopics: mockGetTopics }))

function makeCurrentListResponse() {
  return {
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    topics: {},
    topics_metrics: {},
    fediverse_instances: {},
    hostname_elections: {},
    topic_elections: {},
    markdown_to_html: {},
    bookmarks: {},
    election_votes: {},
  }
}

describe('getFediverseSearch', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGetTopics.mockReset()
    mockGet.mockResolvedValue({ buckets: [] })
  })

  it('calls the Fediverse search endpoint with joined providers', async () => {
    await getFediverseSearch({
      q: 'test',
      providers: ['bluesky'],
      type: 'post',
      limit: 3,
      after: 'cursor-1',
    })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/fediverse/search', {
      searchParams: {
        q: 'test',
        providers: 'bluesky',
        type: 'post',
        limit: 3,
        after: 'cursor-1',
      },
    })
  })

  it('calls the dedicated instance directory endpoint with canonical search parameters', async () => {
    mockGet.mockResolvedValueOnce(makeCurrentListResponse())

    await getFediverseInstances({ searchParams: { q: 'social', sort: 'new', limit: 25 } })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/fediverse/instances', {
      searchParams: { q: 'social', sort: 'new', limit: 25 },
    })
  })

  it('falls back to generic topic search when the deployed instance endpoint is old', async () => {
    const oldDedicatedResponse = {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics: {},
      topics_metrics: {},
      hostname_elections: {},
      topic_elections: {},
      markdown_to_html: {},
      bookmarks: {},
      election_votes: {},
    }
    mockGet.mockResolvedValueOnce(oldDedicatedResponse)
    mockGetTopics.mockResolvedValueOnce(makeTopicsSearchResponse({ topics: [] }))

    const result = await getFediverseInstances({
      searchParams: { q: 'social', sort: 'relevance', limit: 25 },
    })

    expect(result.usesDedicatedEndpoint).toBe(false)
    expect(getTopics).toHaveBeenCalledWith({
      searchParams: {
        q: 'social',
        sort: 'relevance',
        limit: 25,
        topic_types: 'fediverse_instance',
      },
    })
    expect(result.data).toMatchObject({
      fediverse_instances: {},
      hostname_elections: {},
      bookmarks: {},
      election_votes: {},
    })
  })

  it('projects current list attributes to the public allowlist', async () => {
    mockGet.mockResolvedValueOnce({
      ...makeCurrentListResponse(),
      fediverse_instances: {
        'topic-1': {
          software: 'mastodon',
          protocol: 'activitypub',
          nodeinfo_software_version: '4.4.0',
          total_users: 1200,
          monthly_active_users: 340,
          open_registrations: true,
          nodeinfo_raw: { secret: true },
          integration_status: 'approved',
        },
      },
    })

    const result = await getFediverseInstances()
    const attributes = result.data.fediverse_instances['topic-1']

    expect(attributes).toEqual({
      software: 'mastodon',
      protocol: 'activitypub',
      nodeinfo_software_version: '4.4.0',
      total_users: 1200,
      monthly_active_users: 340,
      open_registrations: true,
    })
    expect(attributes).not.toHaveProperty('nodeinfo_raw')
    expect(attributes).not.toHaveProperty('integration_status')
  })

  it('encodes the dedicated instance detail identifier', async () => {
    const detailResponse = {
      ...makeTopicMutationResponse({
        topic: makeTopic({ id: 'topic-1', topic_type: 'fediverse_instance' }),
      }),
      fediverse_instance: {
        software: 'mastodon',
        nodeinfo_raw: { secret: true },
        integration_status: 'approved',
      },
    }
    mockGet.mockResolvedValueOnce(detailResponse)

    const result = await getFediverseInstance('social/example')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/fediverse/instances/social%2Fexample')
    expect(result?.fediverse_instance).toMatchObject({ software: 'mastodon' })
    expect(result?.fediverse_instance).not.toHaveProperty('nodeinfo_raw')
    expect(result?.fediverse_instance).not.toHaveProperty('integration_status')
    expect(result?.hostname_election).toBeNull()
  })
})
