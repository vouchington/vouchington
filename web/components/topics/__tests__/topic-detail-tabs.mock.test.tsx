import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopicDetailTabs } from '../topic-detail-tabs'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => '/card/topic-uuid/posts',
}))

vi.mock(import('@/components/shared/entity-menubar-nav'), () => ({
  EntityMenubarNav: ({
    items,
  }: {
    items: Array<{
      key: string
      content: React.ReactNode
      dropdownItems?: Array<{ key: string; content: React.ReactNode }>
    }>
  }) => (
    <nav>
      {items.map(item => (
        <div key={item.key}>
          {item.content}
          {item.dropdownItems?.map(d => (
            <div key={d.key}>{d.content}</div>
          ))}
        </div>
      ))}
    </nav>
  ),
}))

const metrics = {
  count: { discussions: 5, reviews: 3, 'data-points': 2, news: 1, latest: 1 },
  viewer_count: { discussions: 0, reviews: 0, 'data-points': 0 },
}

describe('TopicDetailTabs slug routing', () => {
  it('uses topicSlug in regular tab hrefs when provided', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-uuid'
        topicSlug='my-card-slug'
        metrics={metrics}
      />,
    )

    const links = screen.getAllByRole('link')
    for (const link of links) {
      expect(link.getAttribute('href')).toContain('/my-card-slug/')
      expect(link.getAttribute('href')).not.toContain('/topic-uuid/')
    }
  })

  it('uses slug for regular tab links but topicId for manage-tags dropdown when slug is provided', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-uuid'
        topicSlug='my-card-slug'
        metrics={metrics}
        isAuthenticated
      />,
    )

    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    const manageTags = links.filter(l => l.getAttribute('href')?.includes('/tags/'))
    const regularTabs = links.filter(l => !l.getAttribute('href')?.includes('/tags/'))
    expect(regularTabs.length).toBeGreaterThan(0)
    for (const link of regularTabs) {
      expect(link.getAttribute('href')).toContain('/my-card-slug/')
      expect(link.getAttribute('href')).not.toContain('/topic-uuid/')
    }
    for (const link of manageTags) {
      expect(link.getAttribute('href')).toContain('/topic-uuid/')
      expect(link.getAttribute('href')).not.toContain('/my-card-slug/')
    }
  })

  it('hides Publisher Type from manage-tags dropdown links for non-source topics', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicTypeName='card'
        topicId='topic-uuid'
        metrics={metrics}
        isAuthenticated
      />,
    )

    expect(screen.getByRole('link', { name: 'Related Topics' })).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Publisher Type' })).toBeNull()
  })

  it('shows Publisher Type in manage-tags dropdown links for source topics', () => {
    render(
      <TopicDetailTabs
        topicType='source'
        topicTypeName='rss_feed'
        topicId='topic-uuid'
        metrics={metrics}
        isAuthenticated
      />,
    )

    expect(screen.getByRole('link', { name: 'Publisher Type' })).toBeDefined()
  })

  it('falls back to topicId in tab hrefs when topicSlug is absent', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-uuid'
        metrics={metrics}
      />,
    )

    const links = screen.getAllByRole('link')
    for (const link of links) {
      expect(link.getAttribute('href')).toContain('/topic-uuid/')
    }
  })

  it('falls back to topicId in tab hrefs when topicSlug is null', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-uuid'
        topicSlug={null}
        metrics={metrics}
      />,
    )

    const links = screen.getAllByRole('link')
    for (const link of links) {
      expect(link.getAttribute('href')).toContain('/topic-uuid/')
    }
  })
})
