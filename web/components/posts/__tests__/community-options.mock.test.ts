import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCommunities } from '@/lib/api/server'
import { makeCommunitiesSearchResponse, makeCommunity } from '@/test-helpers/api-responses'
import { getEligibleCommunityPostOptions } from '../post-form/community-options'

vi.mock(import('@/lib/api/server'), () => ({
  getCommunities: vi.fn<VitestLooseMock>(),
}))

const mockGetCommunities = vi.mocked(getCommunities)

function makeResponse({
  ids,
  hasNextPage = false,
  endCursor = null,
}: {
  ids: string[]
  hasNextPage?: boolean
  endCursor?: string | null
}) {
  return makeCommunitiesSearchResponse({
    communities: ids.map(id =>
      makeCommunity({
        id,
        name: `Community ${id}`,
        slug: `community-${id}`,
        visibility: 'public',
        post_approval_required_at: null,
      }),
    ),
    pageInfo: { has_next_page: hasNextPage, start_cursor: null, end_cursor: endCursor },
  })
}

describe('getEligibleCommunityPostOptions', () => {
  beforeEach(() => {
    mockGetCommunities.mockReset()
  })

  it('maps eligible communities and keeps an eligible requested slug', async () => {
    mockGetCommunities.mockResolvedValue(makeResponse({ ids: ['one'] }))

    const result = await getEligibleCommunityPostOptions('discussion', 'community-one')

    expect(mockGetCommunities).toHaveBeenCalledWith({
      searchParams: { eligible_post_type: 'discussion', limit: 100 },
    })
    expect(result).toEqual({
      communityOptions: [
        {
          id: 'one',
          name: 'Community one',
          slug: 'community-one',
          visibility: 'public',
          post_approval_required_at: null,
        },
      ],
      initialCommunitySlug: 'community-one',
    })
  })

  it('loads additional pages and drops missing community rows', async () => {
    const secondPage = makeResponse({ ids: ['two'] })
    secondPage.results = [
      { __entity_type: 'community', id: 'two' },
      { __entity_type: 'community', id: 'missing' },
    ]

    mockGetCommunities
      .mockResolvedValueOnce(makeResponse({ ids: ['one'], hasNextPage: true, endCursor: 'cursor' }))
      .mockResolvedValueOnce(secondPage)

    const result = await getEligibleCommunityPostOptions('review')

    expect(mockGetCommunities).toHaveBeenLastCalledWith({
      searchParams: { eligible_post_type: 'review', limit: 100, after: 'cursor' },
    })
    expect(result.communityOptions.map(community => community.slug)).toEqual([
      'community-one',
      'community-two',
    ])
  })

  it('fails open when community loading fails', async () => {
    mockGetCommunities.mockRejectedValue(new Error('rate limited'))

    await expect(getEligibleCommunityPostOptions('data_point', 'community-one')).resolves.toEqual({
      communityOptions: [],
      initialCommunitySlug: undefined,
    })
  })
})
