import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TopicRecommendationDialogStatusInfo } from '../topic-recommendation-dialog-status-info'
import type { Post } from '@/types/posts'
import type { PublicUser } from '@/types/user'

function makePost(
  status: 'pending' | 'approved' | 'rejected',
  overrides: Partial<NonNullable<Post['topic_recommendation']>> = {},
): Pick<Post, 'topic_recommendation'> {
  return {
    topic_recommendation: {
      post_id: 'rec-1',
      topic_title: 'Test Topic',
      topic_slug: 'test-topic',
      topic_markdown: '',
      aliases: [],
      hostname_id: null,
      hostname: null,
      hostnames: [],
      approval_error_message: null,
      status,
      reviewed_at: null,
      reviewed_by_id: null,
      rejection_reason: null,
      created_topic_id: null,
      created_topic_slug: null,
      topic_type: 'topic',
      example_referral_link: null,
      landing_page_urls: [],
      ...overrides,
    },
  }
}

const reviewerUsers: Record<string, PublicUser> = {
  'user-admin': {
    id: 'user-admin',
    username: 'adminuser',
    is_official_account: true,
    profile_image_id: null,
  },
}

describe('TopicRecommendationDialogStatusInfo', () => {
  it('renders nothing for pending status', () => {
    const { container } = render(
      <TopicRecommendationDialogStatusInfo
        selected={makePost('pending')}
        users={reviewerUsers}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders approved info with reviewer username', () => {
    const { container } = render(
      <TopicRecommendationDialogStatusInfo
        selected={makePost('approved', {
          reviewed_by_id: 'user-admin',
          reviewed_at: '2024-06-01T10:00:00Z',
          created_topic_id: 'topic-123',
        })}
        users={reviewerUsers}
      />,
    )
    expect(container.querySelector('[data-pw="topic-recommendation-approved-info"]')).not.toBeNull()
    expect(screen.getByText('Approved')).toBeDefined()
    expect(screen.getByText('@adminuser')).toBeDefined()
    expect(
      container.querySelector('[data-pw="topic-recommendation-view-topic-link"]'),
    ).not.toBeNull()
  })

  it('renders approved info without reviewer when users sidecar is empty', () => {
    render(
      <TopicRecommendationDialogStatusInfo
        selected={makePost('approved', {
          reviewed_by_id: 'user-admin',
          reviewed_at: '2024-06-01T10:00:00Z',
        })}
        users={undefined}
      />,
    )
    expect(screen.getByText('Approved')).toBeDefined()
    expect(screen.getByText(/an admin/)).toBeDefined()
    expect(screen.queryByText('@adminuser')).toBeNull()
  })

  it('uses slug in the view-topic link when created_topic_slug is set', () => {
    const { container } = render(
      <TopicRecommendationDialogStatusInfo
        selected={makePost('approved', {
          reviewed_by_id: 'user-admin',
          reviewed_at: '2024-06-01T10:00:00Z',
          created_topic_id: 'topic-uuid',
          created_topic_slug: 'my-topic-slug',
        })}
        users={reviewerUsers}
      />,
    )
    const link = container.querySelector('[data-pw="topic-recommendation-view-topic-link"]')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/topic/my-topic-slug')
  })

  it('renders approved info without view-topic link when created_topic_id is null', () => {
    const { container } = render(
      <TopicRecommendationDialogStatusInfo
        selected={makePost('approved', {
          reviewed_by_id: 'user-admin',
          reviewed_at: '2024-06-01T10:00:00Z',
          created_topic_id: null,
        })}
        users={reviewerUsers}
      />,
    )
    expect(container.querySelector('[data-pw="topic-recommendation-view-topic-link"]')).toBeNull()
  })

  it('renders rejected info with rejection reason', () => {
    const { container } = render(
      <TopicRecommendationDialogStatusInfo
        selected={makePost('rejected', {
          reviewed_by_id: 'user-admin',
          reviewed_at: '2024-06-02T10:00:00Z',
          rejection_reason: 'Already covered by existing topic.',
        })}
        users={reviewerUsers}
      />,
    )
    expect(container.querySelector('[data-pw="topic-recommendation-rejected-info"]')).not.toBeNull()
    expect(screen.getByText('Rejected')).toBeDefined()
    expect(screen.getByText('@adminuser')).toBeDefined()
    expect(screen.getByText(/Already covered by existing topic/)).toBeDefined()
  })

  it('renders rejected info without rejection reason when not set', () => {
    render(
      <TopicRecommendationDialogStatusInfo
        selected={makePost('rejected', {
          reviewed_by_id: 'user-admin',
          reviewed_at: '2024-06-02T10:00:00Z',
          rejection_reason: null,
        })}
        users={reviewerUsers}
      />,
    )
    expect(screen.getByText('Rejected')).toBeDefined()
    expect(screen.queryByText(/Reason:/)).toBeNull()
  })

  it('renders unknown date when reviewed_at is null', () => {
    render(
      <TopicRecommendationDialogStatusInfo
        selected={makePost('approved', {
          reviewed_at: null,
        })}
        users={undefined}
      />,
    )
    expect(screen.getByText(/unknown date/)).toBeDefined()
  })
})
