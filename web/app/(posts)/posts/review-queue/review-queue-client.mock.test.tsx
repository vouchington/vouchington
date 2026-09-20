import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markPostForReview, updateAdminReviewQueuePost } from '@/lib/api/client'
import { AdminReviewQueueClient } from './review-queue-client'
import type { AdminReviewQueueResponse } from '@/types/admin-review-queue'

const mockToastSuccess = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockToastError = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockRefresh = vi.hoisted(() => vi.fn<VitestLooseMock>())
const { mockGetExposureState, mockRecordMediaReveal } = vi.hoisted(() => ({
  mockGetExposureState: vi.fn<VitestLooseMock>(),
  mockRecordMediaReveal: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: mockToastSuccess,
        error: mockToastError,
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client'), () => ({
  updateAdminReviewQueuePost: vi.fn<VitestLooseMock>(),
  markPostForReview: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/moderation-exposure'), () => ({
  getExposureState: mockGetExposureState,
  recordMediaReveal: mockRecordMediaReveal,
}))

const mockUpdateAdminReviewQueuePost = vi.mocked(updateAdminReviewQueuePost)
const mockMarkPostForReview = vi.mocked(markPostForReview)

describe('AdminReviewQueueClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const exposure = { count: 0, threshold: 10, in_cooldown: false, cooldown_ends_at: null }
    mockGetExposureState.mockResolvedValue({ exposure })
    mockRecordMediaReveal.mockResolvedValue({ exposure })
  })

  it('renders queued posts and provider-neutral moderation summaries', () => {
    const { container } = render(<AdminReviewQueueClient initialData={makeResponse()} />)

    expect(screen.getByRole('heading', { name: 'Review Queue' })).toBeDefined()
    expect(screen.getByText('Flagged post')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Flagged post' }).getAttribute('href')).toBe(
      '/discussion/flagged-post',
    )
    expect(screen.getByText('Flagged post')).toHaveAttribute('lang', 'ar')
    expect(screen.getByText('Flagged post')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('link', { name: 'Flagged comment' }).getAttribute('href')).toBe(
      '/discussion/root-post/comment/comment-1',
    )
    expect(screen.getByRole('link', { name: 'Flagged topic' }).getAttribute('href')).toBe(
      '/topic-recommendations?q=Flagged%20topic',
    )
    const flaggedPostRow = screen.getByText('Flagged post').closest('tr')
    expect(flaggedPostRow).not.toBeNull()
    expect(within(flaggedPostRow!).getAllByText('Rejected')).toHaveLength(2)
    expect(within(flaggedPostRow!).getByText('flagged')).toBeDefined()
    expect(screen.queryByText('provider flagged')).toBeNull()
    expect(screen.queryByText('OpenAI:')).toBeNull()
    expect(screen.queryByText('Spam:')).toBeNull()
    const flaggedTopicRow = screen.getByText('Flagged topic').closest('tr')
    expect(flaggedTopicRow).not.toBeNull()
    expect(within(flaggedTopicRow!).getByText('pending')).toBeDefined()
    expect(screen.getByText('3 queued posts, 2 flagged by automated checks')).toBeDefined()
    expect(container.querySelector('[data-pw="moderation-sla-badge"]')).not.toBeNull()
  })

  it('approves a post and removes it from the queue', async () => {
    mockUpdateAdminReviewQueuePost.mockResolvedValue({
      post: { id: 'post-1', clearance_status: 'approved', clearance_updated_at: null },
    })

    render(<AdminReviewQueueClient initialData={makeResponse()} />)

    fireEvent.click(screen.getByRole('button', { name: /Approve Flagged post/i }))

    await waitFor(() => {
      expect(mockUpdateAdminReviewQueuePost).toHaveBeenCalledWith('post-1', 'approved')
    })
    await waitFor(() => {
      expect(screen.queryByText('Flagged post')).toBeNull()
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Post approved')
  })

  it('keeps rejected posts in the queue', async () => {
    mockUpdateAdminReviewQueuePost.mockResolvedValue({
      post: {
        id: 'comment-1',
        clearance_status: 'rejected',
        clearance_updated_at: new Date().toISOString(),
      },
    })

    render(<AdminReviewQueueClient initialData={makeResponse()} />)

    fireEvent.click(screen.getByRole('button', { name: /Reject Flagged comment/i }))

    await waitFor(() => {
      expect(mockUpdateAdminReviewQueuePost).toHaveBeenCalledWith('comment-1', 'rejected')
    })
    await waitFor(() => {
      expect(screen.getByText('Flagged comment')).toBeDefined()
    })
    const rejectedCommentRow = screen.getByText('Flagged comment').closest('tr')
    expect(rejectedCommentRow).not.toBeNull()
    expect(within(rejectedCommentRow!).getByText('Rejected')).toBeDefined()
    expect(mockToastSuccess).toHaveBeenCalledWith('Post rejected')
  })

  it('renders empty state', () => {
    render(
      <AdminReviewQueueClient
        initialData={{
          results: [],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
      />,
    )

    expect(screen.getByText('No posts need review.')).toBeDefined()
  })

  it('renders Mark for Re-review button for each post', () => {
    render(<AdminReviewQueueClient initialData={makeResponse()} />)

    expect(screen.getByRole('button', { name: /Mark for re-review Flagged post/i })).toBeDefined()
    expect(
      screen.getByRole('button', { name: /Mark for re-review Flagged comment/i }),
    ).toBeDefined()
  })

  it('clicking Mark for Re-review calls markPostForReview and toasts success', async () => {
    mockMarkPostForReview.mockResolvedValue({ clearance_status: 'in_review' })

    render(<AdminReviewQueueClient initialData={makeResponse()} />)

    fireEvent.click(screen.getByRole('button', { name: /Mark for re-review Flagged post/i }))

    await waitFor(() => {
      expect(mockMarkPostForReview).toHaveBeenCalledWith('post-1')
    })
    await waitFor(() => {
      expect(screen.getByText('Flagged post')).toBeDefined()
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Post marked for re-review')
  })

  it('records one review-queue reveal for a sensitive post media group', async () => {
    render(<AdminReviewQueueClient initialData={makeResponse()} />)

    const revealButton = screen.getByRole('button', { name: /sensitive content/i })
    await waitFor(() => expect(revealButton).toBeEnabled())
    fireEvent.click(revealButton)

    await waitFor(() => {
      expect(mockRecordMediaReveal).toHaveBeenCalledOnce()
    })
    expect(mockRecordMediaReveal).toHaveBeenCalledWith({
      postId: 'post-1',
      surface: 'review_queue',
    })
  })
})

function makeResponse(): AdminReviewQueueResponse {
  return {
    results: [
      {
        id: 'post-1',
        title: 'Flagged post',
        declared_language: 'ar',
        lingua_rs_detected_language: null,
        slug: 'flagged-post',
        markdown_preview: 'Needs a human look.',
        post_type: 'discussion',
        created_by_id: 'user-1',
        created_at: new Date().toISOString(),
        root_id: null,
        root_post_type: null,
        root_slug: null,
        clearance_status: 'rejected',
        clearance_updated_at: new Date().toISOString(),
        moderation_summary: {
          disposition: 'reject',
          reason_codes: ['provider_flagged'],
          evidence_summary: { flagged_category_count: 1, signal_count: 1 },
        },
        media_reveal: {
          requires_reveal: true,
          images: [
            {
              image_id: 'image-1',
              placement_id: 'placement-1',
              placement_revision: 0,
              order_index: 0,
              caption: 'Flagged image',
            },
          ],
        },
      },
      {
        id: 'comment-1',
        title: 'Flagged comment',
        declared_language: null,
        lingua_rs_detected_language: null,
        slug: null,
        markdown_preview: 'Needs review in context.',
        post_type: 'comment',
        created_by_id: 'user-1',
        created_at: new Date().toISOString(),
        root_id: 'root-1',
        root_post_type: 'discussion',
        root_slug: 'root-post',
        clearance_status: 'in_review',
        clearance_updated_at: new Date().toISOString(),
        moderation_summary: {
          disposition: 'review',
          reason_codes: ['suspicious_signal'],
          evidence_summary: { flagged_category_count: 0, signal_count: 1 },
        },
        media_reveal: { requires_reveal: false, images: [] },
      },
      {
        id: 'topic-recommendation-1',
        title: 'Flagged topic',
        declared_language: null,
        lingua_rs_detected_language: null,
        slug: null,
        markdown_preview: 'Topic recommendation needs review.',
        post_type: 'topic_recommendation',
        created_by_id: 'user-1',
        created_at: new Date().toISOString(),
        root_id: null,
        root_post_type: null,
        root_slug: null,
        clearance_status: 'in_review',
        clearance_updated_at: new Date().toISOString(),
        moderation_summary: {
          disposition: 'review',
          reason_codes: ['future_signal'],
          evidence_summary: { flagged_category_count: 0, signal_count: 0 },
        },
        media_reveal: { requires_reveal: false, images: [] },
      },
    ],
    page_info: {
      has_next_page: false,
      start_cursor: 'post-1',
      end_cursor: 'post-1',
    },
  }
}
