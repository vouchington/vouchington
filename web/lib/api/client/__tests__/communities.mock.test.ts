import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        put: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  applyToCommunity,
  archiveCommunity,
  fetchCommunities,
  fetchCommunityPinnedPosts,
  loadMyCommunities,
  searchMyCommunities,
  setCommunityPinnedPosts,
  updateCommunityPostTypeSettings,
  unarchiveCommunity,
  unpublishCommunityPost,
} from '../communities'
import { disableCommunityAiAgent, enableCommunityAiAgent } from '../community-ai-agents'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
  makeCommunityAiAgent,
  makeCommunityAiAgentResponse,
  makeCommunityResponse,
} from '@/test-helpers/api-responses/communities'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

const mockDelete = vi.mocked(clientApi.delete)
const mockGet = vi.mocked(clientApi.get)
const mockPatch = vi.mocked(clientApi.patch)
const mockPost = vi.mocked(clientApi.post)
const mockPut = vi.mocked(clientApi.put)

describe('communities client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('omits the pagination cursor when searching my first community page', async () => {
    const response = makeCommunitiesSearchResponse({ communities: [] })

    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => searchMyCommunities(100),
      expectedArgs: ['/api/v1/communities', { searchParams: { member_id: 'me', limit: 100 } }],
    })
  })

  it('searches my communities with cursor pagination options', async () => {
    const response = makeCommunitiesSearchResponse({ communities: [] })

    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => searchMyCommunities(100, 'cursor-2'),
      expectedArgs: [
        '/api/v1/communities',
        { searchParams: { member_id: 'me', limit: 100, after: 'cursor-2' } },
      ],
    })
  })

  it('searches my communities with an eligible post type', async () => {
    const response = makeCommunitiesSearchResponse({ communities: [] })

    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => searchMyCommunities(100, undefined, 'review'),
      expectedArgs: [
        '/api/v1/communities',
        { searchParams: { member_id: 'me', limit: 100, eligible_post_type: 'review' } },
      ],
    })
  })

  it('loads all non-archived community pages and reports incremental results', async () => {
    const activeCommunity = makeCommunity({
      id: 'community-1',
      name: 'Active',
      slug: 'active',
    })
    const archivedCommunity = makeCommunity({
      id: 'community-2',
      name: 'Archived',
      slug: 'archived',
      archived_at: '2026-01-01T00:00:00Z',
    })
    const secondCommunity = makeCommunity({
      id: 'community-3',
      name: 'Second',
      slug: 'second',
    })
    const listener = vi.fn<(communities: unknown[]) => void>()
    mockGet
      .mockResolvedValueOnce(
        makeCommunitiesSearchResponse({
          communities: [activeCommunity, archivedCommunity],
          pageInfo: { has_next_page: true, start_cursor: null, end_cursor: 'cursor-2' },
        }),
      )
      .mockResolvedValueOnce(
        makeCommunitiesSearchResponse({
          communities: [secondCommunity],
          pageInfo: { has_next_page: false, start_cursor: 'cursor-2', end_cursor: null },
        }),
      )

    const result = await loadMyCommunities(undefined, [], listener)

    expect(result).toEqual([activeCommunity, secondCommunity])
    expect(listener).toHaveBeenNthCalledWith(1, [activeCommunity])
    expect(listener).toHaveBeenNthCalledWith(2, [activeCommunity, secondCommunity])
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/v1/communities', {
      searchParams: { member_id: 'me', limit: 100, after: 'cursor-2' },
    })
  })

  it('calls patch with unpublished status to unpublish a community post', async () => {
    mockPatch.mockResolvedValueOnce(undefined)

    await unpublishCommunityPost('test-community', 'post-id')

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/communities/test-community/posts/post-id', {
      status: 'unpublished',
      reason_code: 'staff_unpublished',
    })
  })

  it('fetches communities by search query with limit and signal', async () => {
    const signal = new AbortController().signal
    const response = makeCommunitiesSearchResponse({
      communities: [],
      pageInfo: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => fetchCommunities({ q: 'test', limit: 5, signal }),
      expectedArgs: ['/api/v1/communities', { searchParams: { q: 'test', limit: 5 }, signal }],
    })
  })

  it('fetches communities by eligible post type', async () => {
    const response = makeCommunitiesSearchResponse({
      communities: [],
      pageInfo: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => fetchCommunities({ eligible_post_type: 'data_point', limit: 10 }),
      expectedArgs: [
        '/api/v1/communities',
        { searchParams: { eligible_post_type: 'data_point', limit: 10 }, signal: undefined },
      ],
    })
  })

  it('updates community post type settings', async () => {
    const response = makeCommunityResponse({
      community: makeCommunity({ id: 'community-1', allow_review_posts: true }),
      communityMetrics: null,
    })

    await expectApiWrapperCall({
      mock: mockPatch,
      response,
      call: () =>
        updateCommunityPostTypeSettings('my-community', {
          allow_review_posts: true,
        }),
      expectedArgs: [
        '/api/v1/communities/my-community/post-type-settings',
        { allow_review_posts: true },
      ],
    })
  })

  it('archives a community', async () => {
    const response = makeCommunityResponse({
      community: makeCommunity({ id: 'community-1', archived_at: '2026-01-01T00:00:00Z' }),
      communityMetrics: null,
    })

    await expectApiWrapperCall({
      mock: mockPatch,
      response,
      call: () => archiveCommunity('my-community'),
      expectedArgs: ['/api/v1/communities/my-community', { archive: true }],
    })
  })

  it('unarchives a community', async () => {
    const response = makeCommunityResponse({
      community: makeCommunity({ id: 'community-1', archived_at: null }),
      communityMetrics: null,
    })

    await expectApiWrapperCall({
      mock: mockPatch,
      response,
      call: () => unarchiveCommunity('my-community'),
      expectedArgs: ['/api/v1/communities/my-community', { archive: false }],
    })
    expect(mockPatch).toHaveBeenCalledTimes(1)
  })

  it('applies to a community without a message', async () => {
    mockPost.mockResolvedValueOnce(undefined)
    await applyToCommunity('my-community', { q1: 'answer' })
    expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/my-community/applications', {
      answers: { q1: 'answer' },
    })
  })

  it('applies to a community with a message', async () => {
    mockPost.mockResolvedValueOnce(undefined)
    await applyToCommunity('my-community', {}, 'I want to join')
    expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/my-community/applications', {
      answers: {},
      message: 'I want to join',
    })
  })

  it('enables a community AI agent', async () => {
    const response = makeCommunityAiAgentResponse({
      communityAiAgent: makeCommunityAiAgent({ slug: 'self-promotion', enabled: true }),
    })

    await expectApiWrapperCall({
      mock: mockPut,
      response,
      call: () => enableCommunityAiAgent('my-community', 'self-promotion'),
      expectedArgs: ['/api/v1/communities/my-community/ai-agents/self-promotion'],
    })
  })

  it('disables a community AI agent', async () => {
    const response = makeCommunityAiAgentResponse({
      communityAiAgent: makeCommunityAiAgent({ slug: 'self-promotion', enabled: false }),
    })

    await expectApiWrapperCall({
      mock: mockDelete,
      response,
      call: () => disableCommunityAiAgent('my-community', 'self-promotion'),
      expectedArgs: ['/api/v1/communities/my-community/ai-agents/self-promotion'],
    })
  })

  it('fetches community pinned posts', async () => {
    const response = { pinned_posts: [] }

    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => fetchCommunityPinnedPosts('my-community'),
      expectedArgs: ['/api/v1/communities/my-community/pinned-posts'],
    })
  })

  it('sets community pinned posts', async () => {
    const response = { pinned_posts: [] }
    const postIds = ['post-id-1', 'post-id-2']

    await expectApiWrapperCall({
      mock: mockPut,
      response,
      call: () => setCommunityPinnedPosts('my-community', postIds),
      expectedArgs: ['/api/v1/communities/my-community/pinned-posts', { post_ids: postIds }],
    })
  })
})
