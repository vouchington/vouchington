import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
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
    reason,
    claimText,
    onReasonChange,
    onClaimTextChange,
    onSubmit,
    onClose,
  }: {
    submitted: boolean
    reason: string
    claimText: string
    onReasonChange: (v: string) => void
    onClaimTextChange: (v: string) => void
    onSubmit: (e: { preventDefault: () => void }) => void
    onClose: () => void
  }) =>
    submitted ? (
      <p>Your dispute has been submitted</p>
    ) : (
      <div>
        <output data-testid='reason'>{reason}</output>
        <output data-testid='claim-text'>{claimText}</output>
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

function renderControlledDialog() {
  function ControlledDialog() {
    const [open, setOpen] = useState(true)
    return (
      <>
        <button
          type='button'
          onClick={() => setOpen(false)}
        >
          external-close
        </button>
        <button
          type='button'
          onClick={() => setOpen(true)}
        >
          reopen
        </button>
        <DisputeReviewDialog
          open={open}
          onOpenChange={setOpen}
          postId='post-1'
          topicId='topic-1'
        />
      </>
    )
  }

  return render(<ControlledDialog />)
}

describe('DisputeReviewDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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

  it('cancels a pending reset when the dialog unmounts', async () => {
    vi.useFakeTimers()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const { unmount } = renderControlledDialog()

    await act(async () => fireEvent.click(screen.getByText('do-close')))
    const resetTimeout = setTimeoutSpy.mock.results.findLast(
      (_, index) => setTimeoutSpy.mock.calls[index]?.[1] === 300,
    )?.value
    expect(resetTimeout).toBeDefined()
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalledWith(resetTimeout)

    await act(async () => vi.advanceTimersByTime(300))
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('keeps a reopened draft when its prior reset deadline passes', async () => {
    vi.useFakeTimers()
    renderControlledDialog()

    await act(async () => fireEvent.click(screen.getByText('set-reason')))
    await act(async () => fireEvent.click(screen.getByText('set-claim')))
    await act(async () => fireEvent.click(screen.getByText('do-close')))
    await act(async () => vi.advanceTimersByTime(299))
    await act(async () => fireEvent.click(screen.getByText('reopen')))
    await act(async () => vi.advanceTimersByTime(1))

    expect(screen.getByTestId('reason')).toHaveTextContent('defamatory')
    expect(screen.getByTestId('claim-text')).toHaveTextContent('This is wrong.')
  })

  it('resets a closed draft after 300ms', async () => {
    vi.useFakeTimers()
    renderControlledDialog()

    await act(async () => fireEvent.click(screen.getByText('set-reason')))
    await act(async () => fireEvent.click(screen.getByText('set-claim')))
    await act(async () => fireEvent.click(screen.getByText('do-close')))
    await act(async () => vi.advanceTimersByTime(300))
    await act(async () => fireEvent.click(screen.getByText('reopen')))

    expect(screen.getByTestId('reason')).toBeEmptyDOMElement()
    expect(screen.getByTestId('claim-text')).toBeEmptyDOMElement()
  })

  it('resets after an external controlled close', async () => {
    vi.useFakeTimers()
    renderControlledDialog()

    await act(async () => fireEvent.click(screen.getByText('set-reason')))
    await act(async () => fireEvent.click(screen.getByText('set-claim')))
    await act(async () => fireEvent.click(screen.getByText('external-close')))
    await act(async () => vi.advanceTimersByTime(300))
    await act(async () => fireEvent.click(screen.getByText('reopen')))

    expect(screen.getByTestId('reason')).toBeEmptyDOMElement()
    expect(screen.getByTestId('claim-text')).toBeEmptyDOMElement()
  })
})
