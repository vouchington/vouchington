import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFediverseInstancesContinuationPage } from '../fediverse-instances'

const { mockGetPaginatedPage } = vi.hoisted(() => ({
  mockGetPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('../paginated'), () => ({
  getPaginatedPage: mockGetPaginatedPage,
}))

function makeCurrentResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    ...overrides,
  }
}

describe('getFediverseInstancesContinuationPage', () => {
  beforeEach(() => {
    mockGetPaginatedPage.mockReset()
  })

  it('normalizes a current dedicated response without falling back', async () => {
    const response = makeCurrentResponse({
      fediverse_instances: {
        'topic-1': {
          software: 'mastodon',
          protocol: 'activitypub',
          nodeinfo_software_version: '4.4.0',
          total_users: 100,
          monthly_active_users: 25,
          open_registrations: true,
          nodeinfo_raw: { internal: true },
        },
      },
    })
    mockGetPaginatedPage.mockResolvedValueOnce(response)

    const result = await getFediverseInstancesContinuationPage('/api/v1/fediverse/instances', {
      after: 'next',
      sort: 'best',
    })

    expect(mockGetPaginatedPage).toHaveBeenCalledOnce()
    expect(mockGetPaginatedPage).toHaveBeenCalledWith('/api/v1/fediverse/instances', {
      after: 'next',
      sort: 'best',
    })
    expect(result.fediverse_instances['topic-1']).toEqual({
      software: 'mastodon',
      protocol: 'activitypub',
      nodeinfo_software_version: '4.4.0',
      total_users: 100,
      monthly_active_users: 25,
      open_registrations: true,
    })
  })

  it('falls back from an old dedicated response while preserving its query', async () => {
    const oldResponse = {
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
    const fallbackResponse = {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics: {},
      fediverse_instances: {
        'topic-1': {
          software: 'mastodon',
          protocol: 'activitypub',
          nodeinfo_raw: { internal: true },
        },
      },
    }
    mockGetPaginatedPage.mockResolvedValueOnce(oldResponse).mockResolvedValueOnce(fallbackResponse)

    const result = await getFediverseInstancesContinuationPage('/api/v1/fediverse/instances', {
      after: 'next',
      limit: 25,
      q: 'social',
      sort: 'new',
    })

    expect(mockGetPaginatedPage).toHaveBeenNthCalledWith(1, '/api/v1/fediverse/instances', {
      after: 'next',
      limit: 25,
      q: 'social',
      sort: 'new',
    })
    expect(mockGetPaginatedPage).toHaveBeenNthCalledWith(2, '/api/v1/topics', {
      after: 'next',
      limit: 25,
      q: 'social',
      sort: 'new',
      topic_types: 'fediverse_instance',
    })
    expect(result.fediverse_instances['topic-1']).toEqual({
      software: 'mastodon',
      protocol: 'activitypub',
      nodeinfo_software_version: null,
      total_users: null,
      monthly_active_users: null,
      open_registrations: null,
    })
    expect(result).toMatchObject({
      topics_metrics: {},
      hostname_elections: {},
      topic_elections: {},
      markdown_to_html: {},
      bookmarks: {},
      election_votes: {},
    })
  })

  it('normalizes a non-dedicated response without falling back', async () => {
    const response = {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics: {},
    }
    mockGetPaginatedPage.mockResolvedValueOnce(response)

    const result = await getFediverseInstancesContinuationPage('/api/v1/topics', {
      after: 'next',
    })

    expect(mockGetPaginatedPage).toHaveBeenCalledOnce()
    expect(mockGetPaginatedPage).toHaveBeenCalledWith('/api/v1/topics', { after: 'next' })
    expect(result).toMatchObject({
      topics_metrics: {},
      fediverse_instances: {},
      hostname_elections: {},
      topic_elections: {},
      markdown_to_html: {},
      bookmarks: {},
      election_votes: {},
    })
  })
})
