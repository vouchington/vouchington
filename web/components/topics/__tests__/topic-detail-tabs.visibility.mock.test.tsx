import { describe, expect, it, vi, beforeEach } from 'vitest'

import { render, screen } from '@testing-library/react'

import { TopicDetailTabs } from '../topic-detail-tabs'

import { makeMetrics } from '@/test-helpers/components/topics/topic-metrics-fixture'

let mockPathname = '/card/topic-1/discussions'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

describe('TopicDetailTabs tab visibility by topic type and pathname', () => {
  beforeEach(() => {
    mockPathname = '/card/topic-1/discussions'
  })

  it('hides Reviews tab when reviews are not allowed', () => {
    render(
      <TopicDetailTabs
        topicType='topic'
        topicId='topic-1'
        topicTypeName='topic'
        allowReviews={false}
        metrics={makeMetrics({
          count: {
            discussions: 3,
            reviews: 5,
            'data-points': 0,
            news: 0,
            latest: 0,
          },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Posts (8)' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Reviews (5)' })).toBeNull()
  })

  it('shows Reviews tab when reviews are allowed', () => {
    render(
      <TopicDetailTabs
        topicType='topic'
        topicId='topic-1'
        topicTypeName='topic'
        allowReviews
        metrics={makeMetrics({
          count: {
            discussions: 2,
            reviews: 4,
            'data-points': 0,
            news: 0,
            latest: 0,
          },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Posts (6)' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Reviews (4)' })).toBeInTheDocument()
  })

  it('shows Referral Links tab for referral_program topic type', () => {
    render(
      <TopicDetailTabs
        topicType='referral-program'
        topicId='topic-1'
        topicTypeName='referral_program'
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Posts (1)' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Referral Links' })).toBeInTheDocument()
  })

  it('shows Referral Links tab when referralProgramId is set', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        topicTypeName='card'
        referralProgramId='rp-123'
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Posts (1)' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Referral Links' })).toBeInTheDocument()
  })

  it('hides Referral Links tab when referralProgramId is null', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        topicTypeName='card'
        referralProgramId={null}
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Posts (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Referral Links' })).toBeNull()
  })

  it('shows Manage Tags tab when authenticated', () => {
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAuthenticated
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    expect(screen.getByRole('menuitem', { name: 'Manage Tags' })).toBeInTheDocument()
  })

  it('activates Manage Tags tab when pathname matches /tags/ sub-path', () => {
    mockPathname = '/card/topic-1/tags/topic'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAuthenticated
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    const manageTagsTab = screen.getByRole('menuitem', { name: 'Manage Tags' })
    expect(manageTagsTab.getAttribute('data-active')).toBe('true')
  })

  it('does not activate Manage Tags for unrelated paths containing tags', () => {
    mockPathname = '/card/topic-1/tags-other'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        isAuthenticated
        metrics={makeMetrics({
          count: { discussions: 1, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        })}
      />,
    )

    const manageTagsTab = screen.getByRole('menuitem', { name: 'Manage Tags' })
    expect(manageTagsTab.getAttribute('data-active')).toBe('false')
  })

  it('shows Posts tab without count when on /posts and counts are 0', () => {
    mockPathname = '/card/topic-1/posts'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: {
            discussions: 0,
            reviews: 0,
            'data-points': 0,
            news: 0,
            latest: 0,
          },
        })}
      />,
    )

    expect(screen.getByRole('menubar')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Posts' })).toBeInTheDocument()
  })

  it('hides Posts tab when all post counts are 0 and not on /posts', () => {
    mockPathname = '/card/topic-1/news'
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        metrics={makeMetrics({
          count: {
            discussions: 0,
            reviews: 0,
            'data-points': 0,
            news: 5,
            latest: 0,
          },
        })}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: /^Posts/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'News (5)' })).toBeInTheDocument()
  })
})
