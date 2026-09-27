import { makeFeed } from '@/test-helpers/components/sources/source-list-item-rendering.mock-support'

import { describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'

import { SourceListItem } from '../source-list-item'

describe('SourceListItem rendering', () => {
  it('renders title as a link to the topic /latest page', () => {
    const feed = makeFeed()

    const { container } = render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(container.querySelector('[data-pw="source-list-item"]')).not.toBeNull()
    const titleLink = screen.getByRole('link', { name: 'Test Feed (News Source)' })
    expect(titleLink.getAttribute('href')).toBe('/source/example-topic/latest')
  })

  it('falls back to the topic name when the feed title is empty', () => {
    const feed = makeFeed({ title: '' })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Example Topic (News Source)' }).getAttribute('href'),
    ).toBe('/source/example-topic/latest')
  })

  it('renders inline hostname link when hostname present', () => {
    const feed = makeFeed({
      hostname: {
        __entity_type: 'hostname',
        id: 'h1',
        hostname: 'example.com',
        topic_id: null,
      },
      home_page_url: { url: 'https://example.com/' },
    })

    render(
      <SourceListItem
        feed={feed}
        isFollowing={false}
        isFollowingTopic={false}
      />,
    )

    const domainLink = screen.getByRole('link', { name: 'example.com' })
    expect(domainLink.getAttribute('href')).toBe('/domain/example.com')
  })

  it('renders external icon link when home_page_url is present', () => {
    const feed = makeFeed({
      hostname: {
        __entity_type: 'hostname',
        id: 'h1',
        hostname: 'example.com',
        topic_id: null,
      },
      home_page_url: { url: 'https://example.com/' },
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
    expect(externalLink).not.toBeNull()
    expect(externalLink!.getAttribute('href')).toBe('https://example.com/')
  })

  it('falls back to hostname URL when home_page_url is null', () => {
    const feed = makeFeed({
      hostname: {
        __entity_type: 'hostname',
        id: 'h1',
        hostname: 'example.com',
        topic_id: null,
      },
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
    expect(externalLink).not.toBeNull()
    expect(externalLink!.getAttribute('href')).toBe('https://example.com/')
  })
})
