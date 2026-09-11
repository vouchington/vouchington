import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockCreateReviewDispute, mockOnError, mockTurnstileReset } = vi.hoisted(() => ({
  mockCreateReviewDispute: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockTurnstileReset: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/disputes'), () => ({
  createReviewDispute: mockCreateReviewDispute,
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: mockOnError }))

vi.mock(import('@/hooks/use-turnstile-token'), () => ({
  useTurnstileToken: () => ({
    token: 'test-turnstile-token',
    reset: mockTurnstileReset,
    containerRef: vi.fn<VitestLooseMock>(),
    isError: false,
    alwaysApprove: false,
  }),
}))

// Stub the form so the test drives the dialog reducer via its callbacks without
// needing to operate the Radix Select/Textarea internals.
vi.mock(import('./dispute-form'), () => ({
  DisputeForm: ({
    submitted,
    onReasonChange,
    onClaimTextChange,
    onSubmit,
    onClose,
  }: {
    submitted: boolean
    onReasonChange: (v: string) => void
    onClaimTextChange: (v: string) => void
    onSubmit: (e: { preventDefault: () => void }) => void
    onClose: () => void
  }) =>
    submitted ? (
      <p>Your dispute has been submitted</p>
    ) : (
      <div>
        <button
          type='button'
          onClick={() => onReasonChange('defamatory')}
        >
          set-reason
        </button>
        <button
          type='button'
          onClick={() => onClaimTextChange('This is wrong.')}
        >
          set-claim
        </button>
        <button
          type='button'
          onClick={() => onSubmit({ preventDefault: () => {} })}
        >
          do-submit
        </button>
        <button
          type='button'
          onClick={onClose}
        >
          do-close
        </button>
      </div>
    ),
}))

import { DisputeReviewDialog } from './dispute-review-dialog'

function renderDialog(open = true) {
  const onOpenChange = vi.fn<() => void>()
  const result = render(
    <DisputeReviewDialog
      open={open}
      onOpenChange={onOpenChange}
      postId='post-1'
      topicId='topic-1'
    />,
  )
  return { ...result, onOpenChange }
}

describe('DisputeReviewDialog', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the dialog with heading when open', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: /dispute this review/i })).toBeInTheDocument()
  })

  it('does not render the dialog when closed', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has data-pw on the dialog content (rendered in a portal)', () => {
    renderDialog()
    expect(document.querySelector('[data-pw="dispute-review-dialog"]')).not.toBeNull()
  })

  it('calls createReviewDispute and transitions to submitted state on success', async () => {
    mockCreateReviewDispute.mockResolvedValueOnce({
      dispute: { id: 'dispute-1' },
      is_duplicate: false,
    })
    renderDialog()

    await act(async () => fireEvent.click(screen.getByText('set-reason')))
    await act(async () => fireEvent.click(screen.getByText('set-claim')))
    await act(async () => fireEvent.click(screen.getByText('do-submit')))

    await waitFor(() => expect(screen.getByText(/dispute has been submitted/i)).toBeInTheDocument())
    expect(mockCreateReviewDispute).toHaveBeenCalledWith({
      post_id: 'post-1',
      topic_id: 'topic-1',
      reason: 'defamatory',
      claim_text: 'This is wrong.',
      cf_turnstile_response: 'test-turnstile-token',
    })
    expect(mockTurnstileReset).toHaveBeenCalled()
  })

  it('routes errors through onError on failure', async () => {
    const error = new Error('Server error')
    mockCreateReviewDispute.mockRejectedValueOnce(error)
    renderDialog()

    await act(async () => fireEvent.click(screen.getByText('set-reason')))
    await act(async () => fireEvent.click(screen.getByText('set-claim')))
    await act(async () => fireEvent.click(screen.getByText('do-submit')))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ fallback: 'An error occurred' }),
      ),
    )
    expect(screen.queryByText(/dispute has been submitted/i)).not.toBeInTheDocument()
  })

  it('does not submit when reason is empty', () => {
    renderDialog()
    fireEvent.click(screen.getByText('set-claim'))
    fireEvent.click(screen.getByText('do-submit'))
    expect(mockCreateReviewDispute).not.toHaveBeenCalled()
  })

  it('closes via the form onClose', () => {
    const { onOpenChange } = renderDialog()
    fireEvent.click(screen.getByText('do-close'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
