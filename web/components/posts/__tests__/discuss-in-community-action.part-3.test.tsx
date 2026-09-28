import {
  mockSearchMyCommunities,
  resetDiscussInCommunityMocks,
  sourcePost,
} from '@/test-helpers/components/posts/discuss-in-community-action.mock-support'

import { render, screen, fireEvent } from '@testing-library/react'

import { beforeEach, describe, expect, it } from 'vitest'

import { DiscussInCommunityAction } from '../discuss-in-community-action'

import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'

describe('DiscussInCommunityAction', () => {
  beforeEach(() => {
    resetDiscussInCommunityMocks()
  })

  it('loads additional community pages before rendering available options', async () => {
    mockSearchMyCommunities
      .mockResolvedValueOnce(
        makeCommunitiesSearchResponse({
          communities: [
            makeCommunity({
              id: 'inactive-community',
              name: 'Inactive Community',
              slug: 'inactive-community',
              archived_at: '2026-01-02T00:00:00Z',
            }),
          ],
          pageInfo: { has_next_page: true, start_cursor: null, end_cursor: 'page-2' },
        }),
      )
      .mockResolvedValueOnce(
        makeCommunitiesSearchResponse({
          communities: [
            makeCommunity({
              id: 'paged-community',
              name: 'Paged Community',
              slug: 'paged-community',
            }),
          ],
          pageInfo: { has_next_page: false, start_cursor: 'page-2', end_cursor: 'page-2-end' },
        }),
      )

    render(
      <DiscussInCommunityAction
        postId={sourcePost.id}
        source={{ title: sourcePost.title, canonicalPath: '/discussion/source-1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await screen.findByText('Paged Community')
    expect(mockSearchMyCommunities.mock.calls[0]?.[0]).toBe(100)
    expect(mockSearchMyCommunities).toHaveBeenNthCalledWith(2, 100, 'page-2')
  })
})
