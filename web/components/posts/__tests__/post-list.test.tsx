import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import {
  postListMockData,
  renderWithListStyle,
} from '@/test-helpers/components/posts/post-list.mock-support'

import { PostList } from '../post-list'
import type { PostsResponseBody } from '@/types/api-responses'
describe('PostList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders all posts in results', () => {
    renderWithListStyle(<PostList data={postListMockData} />)
    expect(screen.getByText('First Post')).toBeInTheDocument()
    expect(screen.getByText('Second Post')).toBeInTheDocument()
  })

  it('renders empty state when no results', () => {
    const emptyData: PostsResponseBody = {
      ...postListMockData,
      results: [],
      posts: {},
    }

    renderWithListStyle(<PostList data={emptyData} />)
    expect(screen.getByText('No posts found')).toBeInTheDocument()
  })

  it('handles missing posts gracefully', () => {
    const dataWithMissingPost: PostsResponseBody = {
      ...postListMockData,
      results: [
        { __entity_type: 'post', id: 'post-1', ranking: 1, search_vector_ts: null },
        { __entity_type: 'post', id: 'missing-post', ranking: 2, search_vector_ts: null },
      ],
    }

    renderWithListStyle(<PostList data={dataWithMissingPost} />)
    expect(screen.getByText('First Post')).toBeInTheDocument()
    expect(screen.queryByText('Missing Post')).toBeNull()
  })

  it('uses entity_id to render shared feed rows', () => {
    const sharedFeedData: PostsResponseBody = {
      ...postListMockData,
      results: [
        {
          __entity_type: 'post',
          id: 'share-event-1',
          entity_id: 'post-2',
          delivery_type: 'share',
          ranking: 1,
          search_vector_ts: null,
        },
      ],
    }

    renderWithListStyle(<PostList data={sharedFeedData} />)
    expect(screen.getByText('Second Post')).toBeInTheDocument()
  })
})
