import { makeFeed } from '@/test-helpers/components/sources/source-list-item-rendering.mock-support'

import { describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'

import { SourceListItem } from '../source-list-item'

describe('SourceListItem rendering', () => {
  it('does not render "Read or write reviews" text', () => {
    const feed = makeFeed()

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.queryByText('Read or write reviews')).toBeNull()
  })

  it('renders publisher type label when present', () => {
    const feed = makeFeed({
      publisher_type: {
        id: 'publisher-type-1',
        name: 'Mainstream Media',
        slug: 'mainstream-media',
        topic_type: 'topic',
      },
    })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const publisherTypeLink = screen.getByRole('link', { name: 'Mainstream Media' })
    expect(publisherTypeLink.getAttribute('href')).toBe('/topic/mainstream-media')
  })

  it('does not render text "Open feed" or "Open homepage"', () => {
    const feed = makeFeed({
      home_page_url: { url: 'https://example.com/' },
    })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.queryByText('Open feed')).toBeNull()
    expect(screen.queryByText('Open homepage')).toBeNull()
  })
})
