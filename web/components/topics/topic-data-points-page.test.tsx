import {
  installTopicPostListPageDoubles,
  mockGetPosts,
} from '@/test-helpers/components/topics/topic-post-list-page.mock-support'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { TopicDataPointsPage } from './topic-data-points-page'

describe('TopicDataPointsPage', () => {
  installTopicPostListPageDoubles()

  it('uses URL sort and query params for topic data points', async () => {
    await TopicDataPointsPage({
      id: 'topic-1',
      searchParams: { q: 'balance #cards', sort: 'hot' },
    })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        data_point_topic: 'topic-1',
        post_types: 'data_point',
        q: 'balance #cards',
        sort: 'hot',
        limit: 25,
      },
    })
  })

  it('normalizes unsupported URL sorts for topic data points', async () => {
    await TopicDataPointsPage({
      id: 'topic-1',
      searchParams: { sort: 'unsupported' },
    })

    expect(mockGetPosts).toHaveBeenCalledWith({
      searchParams: {
        data_point_topic: 'topic-1',
        post_types: 'data_point',
        sort: 'new',
        limit: 25,
      },
    })
  })

  it('renders recoverable hashtag search errors inline', async () => {
    mockGetPosts.mockRejectedValue(
      new ApiError('Bad Request', 400, { error: 'Topic #missing was not found' }),
    )

    const ui = await TopicDataPointsPage({ id: 'topic-1', searchParams: { q: '#missing' } })
    render(ui)

    expect(screen.getByText('Topic #missing was not found')).toBeDefined()
    expect(screen.queryByText(/"data_point_topic"/)).toBeNull()
  })
})
