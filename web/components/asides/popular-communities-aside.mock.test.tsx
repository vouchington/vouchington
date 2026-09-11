import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'

vi.mock(import('@/lib/api/server'), () => ({
  getCommunities: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/asides/popular-communities-aside-content'), () => ({
  PopularCommunitiesAsideContent: ({
    communities,
  }: {
    communities: Array<{ id: string; slug: string; name: string }>
  }) => (
    <ul>
      {communities.map(c => (
        <li key={c.id}>{c.name}</li>
      ))}
    </ul>
  ),
}))

import { getCommunities } from '@/lib/api/server'
import { PopularCommunitiesAside } from './popular-communities-aside'

type MockResponse = Awaited<ReturnType<typeof getCommunities>>

const mockGetCommunities = vi.mocked(getCommunities)

const makeResponse = (ids: string[]): MockResponse =>
  makeCommunitiesSearchResponse({
    communities: ids.map(id =>
      makeCommunity({
        id,
        slug: `community-${id}`,
        name: `Community ${id}`,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }),
    ),
    communityMetrics: {},
  })

describe('PopularCommunitiesAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when there are no communities', async () => {
    mockGetCommunities.mockResolvedValue(makeResponse([]))
    const result = await PopularCommunitiesAside()
    expect(result).toBeNull()
  })

  it('renders community names when communities are present', async () => {
    mockGetCommunities.mockResolvedValue(makeResponse(['1', '2']))
    const result = await PopularCommunitiesAside()
    render(result as ReactElement)
    expect(screen.getByText('Community 1')).toBeDefined()
    expect(screen.getByText('Community 2')).toBeDefined()
  })

  it('slices to at most 3 communities even if more are returned', async () => {
    mockGetCommunities.mockResolvedValue(makeResponse(['1', '2', '3', '4']))
    const result = await PopularCommunitiesAside()
    render(result as ReactElement)
    expect(screen.queryByText('Community 4')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('renders nothing when all community lookups are missing from the map', async () => {
    const response = makeResponse(['missing'])
    delete response.communities.missing
    mockGetCommunities.mockResolvedValue(response)
    const result = await PopularCommunitiesAside()
    expect(result).toBeNull()
  })
})
