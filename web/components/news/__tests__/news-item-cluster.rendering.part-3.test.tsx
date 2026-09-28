import {
  makeItem,
  makePost,
  makeStory,
} from '@/test-helpers/components/news/news-item-cluster.mock-support'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewsItemCluster } from '../news-item-cluster'

const primary = makeItem('item-1', 'Primary Article')

describe('NewsItemCluster rendering', () => {
  it('filters story-post from primary relatedPosts when storyPost is provided', () => {
    const storyPost = makePost({
      id: 'sp-1',
      post_type: 'story',
      slug: 'ai-story',
      title: 'The Story Post',
    })
    const otherPost = makePost({
      id: 'other-1',
      post_type: 'discussion',
      slug: 'other',
      title: 'Other Discussion',
    })
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory()}
        storyPost={storyPost}
        relatedPosts={[storyPost, otherPost]}
        view='summary'
      />,
    )
    expect(screen.queryByText('The Story Post')).toBeNull()
    expect(screen.queryAllByText('Other Discussion').length).toBeGreaterThan(0)
  })
})
