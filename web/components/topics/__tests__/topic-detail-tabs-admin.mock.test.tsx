import type React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopicDetailTabs } from '../topic-detail-tabs'
import { buildAdminTabItems } from '../topic-admin-tab-items'
import type { TopicMetrics } from '@/types/topics'

let mockPathname = '/card/topic-1/posts'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

function makeMetrics(overrides: Partial<TopicMetrics> = {}): TopicMetrics {
  return {
    __entity_type: 'topic_metrics',
    id: 'topic-1',
    count: {
      discussions: 1,
      reviews: 0,
      'data-points': 0,
      news: 0,
      latest: 0,
    },
    ratings: {
      count: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    },
    ratings__updated_at: '2024-01-15T10:00:00Z',
    bookmarks: { follow: 0 },
    bookmarks__updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

describe('TopicDetailTabs admin tab visibility', () => {
  beforeEach(() => {
    mockPathname = '/card/topic-1/posts'
  })

  it('shows Settings dropdown trigger when isAdmin=true', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAdmin
        metrics={makeMetrics()}
      />,
    )

    expect(screen.getByRole('menuitem', { name: /Settings/i })).toBeDefined()
  })

  it('does not show Settings tab when isAdmin=false', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAdmin={false}
        metrics={makeMetrics()}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: /Settings/i })).toBeNull()
  })

  it('does not show Settings tab when isAdmin is omitted', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics()}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: /Settings/i })).toBeNull()
  })

  it('Settings trigger carries correct data-pw value', () => {
    const { container } = render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAdmin
        metrics={makeMetrics()}
      />,
    )

    expect(container.querySelector('[data-pw="topic-detail-tab-settings"]')).not.toBeNull()
  })

  it('Settings trigger is active when pathname is under /settings', () => {
    mockPathname = '/card/topic-1/settings/about'
    const { container } = render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAdmin
        metrics={makeMetrics()}
      />,
    )

    expect(
      container.querySelector('[data-pw="topic-detail-tab-settings"]')?.getAttribute('data-active'),
    ).toBe('true')
  })

  it('Settings trigger is inactive when pathname is not under /settings', () => {
    mockPathname = '/card/topic-1/posts'
    const { container } = render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAdmin
        metrics={makeMetrics()}
      />,
    )

    expect(
      container.querySelector('[data-pw="topic-detail-tab-settings"]')?.getAttribute('data-active'),
    ).toBe('false')
  })

  it('renders menu even when all post counts are 0 if isAdmin is true', () => {
    mockPathname = '/card/topic-1/settings/about'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAdmin
        metrics={makeMetrics({
          count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menubar')).toBeDefined()
    expect(screen.getByRole('menuitem', { name: /Settings/i })).toBeDefined()
  })
})

describe('buildAdminTabItems dropdown sub-pages', () => {
  it('includes standard sub-pages for non-rss_feed topics', () => {
    const items = buildAdminTabItems('card', 'topic-1', null, '/card/topic-1/posts', 'card')
    const dropdownItems = items[0]?.dropdownItems ?? []
    const keys = dropdownItems.map(d => d.key)

    expect(keys).toContain('about')
    expect(keys).toContain('behavior')
    expect(keys).toContain('domains')
    expect(keys).toContain('aliases')
    expect(keys).toContain('merge')
    expect(keys).not.toContain('source')
  })

  it('includes Source sub-page for rss_feed topics', () => {
    const items = buildAdminTabItems('card', 'topic-1', null, '/card/topic-1/posts', 'rss_feed')
    const dropdownItems = items[0]?.dropdownItems ?? []
    const keys = dropdownItems.map(d => d.key)

    expect(keys).toContain('source')
  })

  it('includes Validations sub-page for referral_program topics', () => {
    const items = buildAdminTabItems(
      'referral-program',
      'rp-1',
      null,
      '/referral-program/rp-1/posts',
      'referral_program',
    )
    const dropdownItems = items[0]?.dropdownItems ?? []
    const keys = dropdownItems.map(d => d.key)

    expect(keys).toContain('validations')

    // Verify label by rendering the dropdown item's content
    const validationsItem = dropdownItems.find(d => d.key === 'validations')
    expect(validationsItem).toBeDefined()
    const { container } = render(validationsItem!.content)
    expect(container.textContent).toBe('Validations')
  })

  it('does not include Validations sub-page for non-referral_program topics', () => {
    const items = buildAdminTabItems('card', 'topic-1', null, '/card/topic-1/posts', 'card')
    const dropdownItems = items[0]?.dropdownItems ?? []
    const keys = dropdownItems.map(d => d.key)

    expect(keys).not.toContain('validations')
  })

  it('marks sub-page active when pathname matches', () => {
    const items = buildAdminTabItems(
      'card',
      'topic-1',
      null,
      '/card/topic-1/settings/about',
      'card',
    )
    const dropdownItems = items[0]?.dropdownItems ?? []
    const aboutItem = dropdownItems.find(d => d.key === 'about')
    const behaviorItem = dropdownItems.find(d => d.key === 'behavior')

    expect(aboutItem?.active).toBe(true)
    expect(behaviorItem?.active).toBe(false)
  })
})
