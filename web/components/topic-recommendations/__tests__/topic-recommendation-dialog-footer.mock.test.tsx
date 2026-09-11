import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { TopicRecommendationDialogFooter } from '../topic-recommendation-dialog-footer'
import type { Post } from '@/types/posts'

const { mockOnError } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(import('@/lib/api/client/elections'), () => ({
  clearPostVote: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  submitPostVote: vi.fn<VitestLooseMock>().mockRejectedValue(new Error('vote failed')),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/components/shared/entity-action-icons'),
  () =>
    ({
      EntityActionIcons: {
        recommendationDismiss: () => <svg data-testid='recommendation-dismiss-icon' />,
      },
    }) as unknown as typeof import('@/components/shared/entity-action-icons'),
)

const pendingPost: Pick<Post, 'id' | 'title' | 'markdown' | 'topic_recommendation'> = {
  id: 'post-1',
  title: 'Test Post',
  markdown: 'Test content',
  topic_recommendation: {
    post_id: 'post-1',
    topic_title: 'Test Topic',
    topic_slug: 'test-topic',
    topic_markdown: '',
    aliases: [],
    hostname_id: null,
    hostname: null,
    hostnames: [],
    topic_wikipedia_pageid: null,
    approval_error_message: null,
    status: 'pending',
    reviewed_at: null,
    reviewed_by_id: null,
    rejection_reason: null,
    created_topic_id: null,
    topic_type: 'topic',
    example_referral_link: null,
    landing_page_urls: [],
  },
}

const selectedElection = {
  id: 'election-1',
  votes_count_up: 3,
  votes_count_down: 1,
}

function renderFooter() {
  return render(
    <TopicRecommendationDialogFooter
      selected={pendingPost}
      selectedElection={selectedElection}
      selectedVote={undefined}
      hasPrevious={false}
      hasNext={false}
      hideDownCount={false}
      isAdmin
      isSaving={false}
      onApprove={vi.fn<VitestLooseMock>()}
      onNavigateNext={vi.fn<VitestLooseMock>()}
      onNavigatePrevious={vi.fn<VitestLooseMock>()}
      onPersistChanges={vi.fn<VitestLooseMock>()}
      onReject={vi.fn<VitestLooseMock>()}
      previousRef={createRef()}
      nextRef={createRef()}
    />,
  )
}

describe('TopicRecommendationDialogFooter', () => {
  it('keeps keyboard hints decorative without reducing their contrast', () => {
    const { container } = renderFooter()

    const keyboardHints = container.querySelectorAll('kbd')
    expect(keyboardHints).toHaveLength(2)
    for (const keyboardHint of keyboardHints) {
      expect(keyboardHint).toHaveAttribute('aria-hidden', 'true')
      expect(keyboardHint).not.toHaveClass('opacity-70')
    }
  })

  it('calls onError when a recommendation vote fails', async () => {
    renderFooter()
    fireEvent.click(screen.getByRole('button', { name: 'Support' }))
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to submit vote',
        skipSentry: true,
      })
    })
  })

  it('renders the semantic recommendation dismiss icon on reject', () => {
    renderFooter()

    expect(screen.getByRole('button', { name: /Reject/ })).toContainElement(
      screen.getByTestId('recommendation-dismiss-icon'),
    )
  })
})
