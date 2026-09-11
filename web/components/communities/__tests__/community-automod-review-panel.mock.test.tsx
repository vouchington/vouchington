import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { CommunityAutomodReviewPanel } from '../community-automod-review-panel'
import type { CommunityAutomodAction } from '@/types/api-responses'

const mocks = vi.hoisted(() => ({
  onError: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
  recordCommunityAutomodFeedback: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/community-automod'), () => ({
  recordCommunityAutomodFeedback: mocks.recordCommunityAutomodFeedback,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mocks.onError,
  onSuccess: mocks.onSuccess,
}))

const mockNav = createNavMock()

function automodAction(overrides: Partial<CommunityAutomodAction> = {}): CommunityAutomodAction {
  return {
    source_key: 'agent_moderation:11111111-1111-7111-8111-111111111111',
    source_type: 'agent_moderation',
    post_id: 'post-1',
    community_id: 'community-1',
    agent_moderation_id: '11111111-1111-7111-8111-111111111111',
    moderator_slug: 'self-promotion',
    title: 'Review this post',
    authored_title: 'Review this post',
    declared_language: null,
    lingua_rs_detected_language: 'en',
    markdown_preview: 'Potentially useful post that was removed.',
    post_type: 'discussion',
    created_at: '2026-06-01T12:00:00.000Z',
    action_at: '2026-06-01T12:05:00.000Z',
    confidence_score: 0.42,
    flagged: true,
    reason: 'Possible self promotion',
    categories: ['self-promotion'],
    model_output: {},
    current_state: 'rejected',
    feedback_label: null,
    ...overrides,
    post_href: overrides.post_href ?? '/discussion/post-1',
  }
}

describe('CommunityAutomodReviewPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders candidate automod actions', () => {
    render(
      <CommunityAutomodReviewPanel
        actions={[automodAction()]}
        communitySlug='credit-cards'
        stats={{ total_count: 2, false_positive_count: 1, false_positive_rate: 0.5 }}
      />,
    )

    expect(document.querySelector('section[aria-label="Automod review"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Review this post')
    expect(document.body.textContent).toContain('1 of 2 recent automod removals')
  })

  it('records false-positive feedback when a moderator reinstates a post', async () => {
    mocks.recordCommunityAutomodFeedback.mockResolvedValueOnce({ applied_action: true })
    render(
      <CommunityAutomodReviewPanel
        actions={[automodAction()]}
        communitySlug='credit-cards'
        stats={{ total_count: 1, false_positive_count: 0, false_positive_rate: 0 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /reinstate/i }))

    await waitFor(() => {
      expect(mocks.recordCommunityAutomodFeedback).toHaveBeenCalledWith(
        'credit-cards',
        'agent_moderation:11111111-1111-7111-8111-111111111111',
        {
          outcome: 'false_positive',
          action: 'reinstate',
          reason_code: null,
          note: null,
        },
      )
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Post reinstated')
    expect(mockNav.refresh).toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Review this post')
  })

  it('reports deferred reinstatement as a saved automod label', async () => {
    mocks.recordCommunityAutomodFeedback.mockResolvedValueOnce({ applied_action: false })
    render(
      <CommunityAutomodReviewPanel
        actions={[automodAction()]}
        communitySlug='credit-cards'
        stats={{ total_count: 1, false_positive_count: 0, false_positive_rate: 0 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /reinstate/i }))

    await waitFor(() => {
      expect(mocks.onSuccess).toHaveBeenCalledWith('Automod label saved')
    })
    expect(mockNav.refresh).toHaveBeenCalled()
  })

  it('includes selected reason chips in keep-removed feedback', async () => {
    mocks.recordCommunityAutomodFeedback.mockResolvedValueOnce({ applied_action: true })
    render(
      <CommunityAutomodReviewPanel
        actions={[automodAction()]}
        communitySlug='credit-cards'
        stats={{ total_count: 1, false_positive_count: 0, false_positive_rate: 0 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /correct/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep removed/i }))

    await waitFor(() => {
      expect(mocks.recordCommunityAutomodFeedback).toHaveBeenCalledWith(
        'credit-cards',
        'agent_moderation:11111111-1111-7111-8111-111111111111',
        expect.objectContaining({
          outcome: 'true_positive',
          action: 'keep_removed',
          reason_code: 'correct',
        }),
      )
    })
  })
})
