import { makeFeed } from '@/test-helpers/components/sources/source-list-item-rendering.mock-support'

import { describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'

import { SourceListItem } from '../source-list-item'

describe('SourceListItem rendering', () => {
  it('does not render external icon link when no hostname and no home_page_url', () => {
    const feed = makeFeed({
      hostname: null,
      home_page_url: null,
    })

    const { container } = render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const externalLink = container.querySelector(
      'a[target="_blank"][rel="nofollow noopener noreferrer"]',
    )
    expect(externalLink).toBeNull()
  })

  it('does not render DomainTrustBadge when no hostname', () => {
    const feed = makeFeed({ hostname: null })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(screen.queryByTestId('domain-trust-badge')).toBeNull()
  })

  it('renders DomainTrustBadge when hostname is present, with href pointing to reviews', () => {
    const feed = makeFeed({
      hostname: {
        __entity_type: 'hostname',
        id: 'h1',
        hostname: 'example.com',
        topic_id: null,
      },
    })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
        hostnameElection={{
          __entity_type: 'hostname_election',
          id: 'h1',
          votes_score_net: 3,
          votes_count_up: 5,
          votes_count_down: 2,
        }}
      />,
    )

    const badge = screen.getByTestId('domain-trust-badge')
    expect(badge).not.toBeNull()
    expect(badge.getAttribute('data-href')).toBe('/source/example-topic/reviews')
  })

  it('renders "Unrated" link to reviews when no hostname', () => {
    const feed = makeFeed({ hostname: null })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const unratedLink = screen.getByRole('link', { name: 'Unrated' })
    expect(unratedLink.getAttribute('href')).toBe('/source/example-topic/reviews')
  })

  it('does not render the topic name as a badge in the metadata row', () => {
    const feed = makeFeed()

    const { container } = render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const badge = container.querySelector('[data-slot="badge"]')
    expect(badge).toBeNull()
  })
})
