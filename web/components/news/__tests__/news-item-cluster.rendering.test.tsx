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
  it('renders standalone NewsItemCard when no story', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        view='summary'
      />,
    )
    expect(screen.getByText('Primary Article')).toBeDefined()
    expect(screen.queryByRole('button', { name: /related/i })).toBeNull()
    expect(container.querySelector('[data-pw="news-item-card"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="news-item-cluster"]')).toBeNull()
  })

  it('wraps story in a Card with data-pw="news-item-cluster" when story is present', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'My Story' })}
        view='summary'
      />,
    )
    expect(container.querySelector('[data-pw="news-item-cluster"]')).not.toBeNull()
    expect(screen.getByText('My Story')).toBeDefined()
  })

  it('displays story title when provided', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'AI Breakthrough' })}
        view='summary'
      />,
    )
    expect(screen.getByText('AI Breakthrough')).toBeDefined()
  })

  it('story title is a link to the story-post when storyPost is provided', () => {
    const storyPost = makePost({ id: 'sp-1', post_type: 'story', slug: 'ai-story-abc' })
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'AI Breakthrough' })}
        storyPost={storyPost}
        view='summary'
      />,
    )
    const titleLink = screen.getByRole('link', { name: /AI Breakthrough/i })
    expect(titleLink).toBeDefined()
    expect((titleLink as HTMLAnchorElement).href).toContain('/story/ai-story-abc')
  })

  it('story title is plain text (not a link) when no storyPost', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ title: 'AI Breakthrough' })}
        view='summary'
      />,
    )
    const title = screen.getByText('AI Breakthrough')
    expect(title.tagName).not.toBe('A')
  })

  it('shows official badge on the official item', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({ official_rss_feed_item_id: 'item-1' })}
        view='summary'
      />,
    )
    expect(screen.getByText('Official source')).toBeDefined()
  })

  it('collapses headerless story with no members to standalone NewsItemCard and displays official badge', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        story={makeStory({
          title: null,
          published_at: null,
          cluster_reason: null,
          official_rss_feed_item_id: 'item-1',
        })}
        view='summary'
      />,
    )
    expect(container.querySelector('[data-pw="news-item-card"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="news-item-cluster"]')).toBeNull()
    expect(screen.getByText('Official source')).toBeDefined()
  })
})
