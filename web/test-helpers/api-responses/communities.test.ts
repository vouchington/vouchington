import { describe, expect, it } from 'vitest'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
  makeCommunityAiAgent,
  makeCommunityAiAgentResponse,
  makeCommunityMetrics,
  makeCommunityResponse,
} from './communities'
import type { CommunitiesSearchResponseBody, Community } from '@/types/api-responses'

describe('community API response factories', () => {
  it('builds a default serialized community response entity', () => {
    const community: Community = makeCommunity()

    expect(community).toMatchObject({
      __entity_type: 'community',
      id: 'community-1',
      created_at: '2026-01-01T00:00:00Z',
      allow_review_posts: false,
      allow_data_point_posts: false,
      default_language: null,
      lingua_rs_detected_language: null,
    })
  })

  it('applies community and metrics overrides without dropping required fields', () => {
    const community = makeCommunity({
      id: 'community-2',
      name: 'Private Community',
      slug: 'private-community',
      visibility: 'private',
    })
    const metrics = makeCommunityMetrics({ id: community.id, member_count: 3 })

    expect(community.created_by_id).toBe('user-1')
    expect(community.visibility).toBe('private')
    expect(metrics).toMatchObject({ id: 'community-2', member_count: 3, post_count: 0 })
  })

  it('indexes communities into a typed search response', () => {
    const first = makeCommunity({ id: 'first', name: 'First', slug: 'first' })
    const second = makeCommunity({ id: 'second', name: 'Second', slug: 'second' })

    const response: CommunitiesSearchResponseBody = makeCommunitiesSearchResponse({
      communities: [first, second],
      pageInfo: { has_next_page: true, start_cursor: null, end_cursor: 'cursor-2' },
    })

    expect(response.results).toEqual([
      { __entity_type: 'community', id: 'first' },
      { __entity_type: 'community', id: 'second' },
    ])
    expect(response.communities.first).toBe(first)
    expect(response.community_metrics.second?.id).toBe('second')
    expect(response.page_info.end_cursor).toBe('cursor-2')
  })

  it('includes optional authenticated search response fields when supplied', () => {
    const response = makeCommunitiesSearchResponse({
      communityMemberships: {},
      pendingApplicationCommunityIds: ['community-1'],
      bookmarks: { 'community-1': { follow: true } },
    })

    expect(response.community_memberships).toEqual({})
    expect(response.pending_application_community_ids).toEqual(['community-1'])
    expect(response.bookmarks).toEqual({ 'community-1': { follow: true } })
  })

  it('builds a typed community detail response', () => {
    const community = makeCommunity({ id: 'detail-community' })
    const response = makeCommunityResponse({ community, hasPendingApplication: true })

    expect(response.community).toBe(community)
    expect(response.community_metrics?.id).toBe('detail-community')
    expect(response.has_pending_application).toBe(true)
  })

  it('preserves an explicit null community metrics detail response', () => {
    const response = makeCommunityResponse({ communityMetrics: null })

    expect(response.community_metrics).toBeNull()
  })

  it('builds a typed community AI-agent response', () => {
    const response = makeCommunityAiAgentResponse({
      communityAiAgent: makeCommunityAiAgent({ slug: 'self-promotion', enabled: true }),
    })

    expect(response.community_ai_agent).toMatchObject({
      slug: 'self-promotion',
      enabled: true,
      entitlement: { allowed: true, reason: null },
    })
  })
})
