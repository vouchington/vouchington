import {
  makeItem,
  makePost,
  makeStory,
  mockAuthState,
} from '@/test-helpers/components/news/news-item-cluster.mock-support'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewsItemCluster } from '../news-item-cluster'

const primary = makeItem('item-1', 'Primary Article')
const storyItem1 = makeItem('item-2', 'Related Article 1')

describe('NewsItemCluster rendering — Discuss the full story CTA', () => {
  it('shows button when logged in, no storyPost, and storyItems.length >= 1', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1]}
        story={makeStory({ title: 'AI Breakthrough' })}
        view='summary'
      />,
    )
    expect(container.querySelector('[data-pw="news-item-cluster-discuss-story"]')).not.toBeNull()
  })

  it('does not show button when storyPost exists', () => {
    const storyPost = makePost({ id: 'sp-1', post_type: 'story', slug: 'ai-story-abc' })
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1]}
        story={makeStory({ title: 'AI Breakthrough' })}
        storyPost={storyPost}
        view='summary'
      />,
    )
    expect(container.querySelector('[data-pw="news-item-cluster-discuss-story"]')).toBeNull()
  })

  it('does not show button when not logged in', () => {
    mockAuthState.isAuthenticated = false
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1]}
        story={makeStory({ title: 'AI Breakthrough' })}
        view='summary'
      />,
    )
    expect(container.querySelector('[data-pw="news-item-cluster-discuss-story"]')).toBeNull()
    mockAuthState.isAuthenticated = true
  })

  it('does not show button when storyItems is empty', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'AI Breakthrough' })}
        view='summary'
      />,
    )
    expect(container.querySelector('[data-pw="news-item-cluster-discuss-story"]')).toBeNull()
  })
})
