import {
  installTopicPostListPageDoubles,
  mockGetPosts,
} from '@/test-helpers/components/topics/topic-post-list-page.mock-support'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { TopicPostsPage } from './topic-posts-page'

describe('TopicPostsPage', () => {
  installTopicPostListPageDoubles()

  it('uses URL sort and query params for topic posts without post type filtering', async () => {
    await TopicPostsPage({
      id: 'topic-1',
      searchParams: { q: 'cashback #cards', sort: 'hot', post_types: 'review' },
    })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        topics: 'topic-1',
        q: 'cashback #cards',
        sort: 'hot',
        limit: 25,
      },
    })
  })

  it('normalizes unsupported URL sorts for topic posts', async () => {
    await TopicPostsPage({
      id: 'topic-1',
      searchParams: { sort: 'unsupported' },
    })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        topics: 'topic-1',
        sort: 'new',
        limit: 25,
      },
    })
  })

  it('renders recoverable hashtag search errors inline', async () => {
    mockGetPosts.mockRejectedValue(
      new ApiError('Bad Request', 400, { error: 'Topic #missing was not found' }),
    )

    const ui = await TopicPostsPage({ id: 'topic-1', searchParams: { q: '#missing' } })
    render(ui)

    expect(screen.getByText('Topic #missing was not found')).toBeDefined()
    expect(screen.queryByText(/"topics"/)).toBeNull()
  })
})
