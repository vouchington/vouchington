import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewDispute } from '@/types/review-disputes'

const h = vi.hoisted(() => ({
  mockApproveDispute: vi.fn<VitestLooseMock>(),
  mockSendDisputeResolution: vi.fn<VitestLooseMock>(),
  mockResolveDisputeRemove: vi.fn<VitestLooseMock>(),
  mockResolveDisputeAnnotate: vi.fn<VitestLooseMock>(),
  mockDismissDispute: vi.fn<VitestLooseMock>(),
  mockRerunDisputeAI: vi.fn<VitestLooseMock>(),
  mockReconcileDisputeAIDraft: vi.fn<VitestLooseMock>(),
  mockUpdateDisputeDraft: vi.fn<VitestLooseMock>(),
  mockListReviewDisputesClient: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/disputes'), () => ({
  approveDispute: h.mockApproveDispute,
  sendDisputeResolution: h.mockSendDisputeResolution,
  resolveDisputeRemove: h.mockResolveDisputeRemove,
  resolveDisputeAnnotate: h.mockResolveDisputeAnnotate,
  dismissDispute: h.mockDismissDispute,
  rerunDisputeAI: h.mockRerunDisputeAI,
  reconcileDisputeAIDraft: h.mockReconcileDisputeAIDraft,
  updateDisputeDraft: h.mockUpdateDisputeDraft,
  listReviewDisputesClient: h.mockListReviewDisputesClient,
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: h.mockOnError }))

import { DisputesClient } from '../disputes-client'
import { makeDispute, makeDisputesData } from '../fixtures/disputes-client-fixtures'

describe('DisputesClient — error handling, member tier, pagination, reducer', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('routes errors through onError for approve', async () => {
    const error = new Error('Server error')
    h.mockApproveDispute.mockRejectedValueOnce(error)
    h.mockUpdateDisputeDraft.mockResolvedValueOnce({ dispute: makeDispute() })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() =>
      expect(h.mockOnError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ fallback: 'Failed to approve dispute' }),
      ),
    )
  })

  it('routes errors through onError for send', async () => {
    const error = new Error('Send failed')
    h.mockSendDisputeResolution.mockRejectedValueOnce(error)
    const approved = makeDispute({ approved_at: 'x', sent_at: null })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData([approved])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(h.mockOnError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ fallback: 'Failed to send dispute resolution' }),
      ),
    )
  })

  it('shows the saved AI draft only after queue admission and reconciliation', async () => {
    const before = makeDispute({ ai_drafted_at: null, ai_public_response: null })
    const after = makeDispute({
      ai_drafted_at: '2026-01-02T00:00:00Z',
      ai_draft_run_id: 'job-1',
      ai_draft_requested_run_id: 'job-1',
      ai_public_response: 'Reviewed draft response',
    })
    let completeAdmission!: (value: { queued: true; run_id: string }) => void
    h.mockRerunDisputeAI.mockImplementationOnce(
      () =>
        new Promise<{ queued: true; run_id: string }>(resolve => {
          completeAdmission = resolve
        }),
    )
    h.mockReconcileDisputeAIDraft.mockResolvedValueOnce(after)
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData([before])}
      />,
    )

    fireEvent.click(screen.getByTitle('Re-run AI'))
    expect(h.mockReconcileDisputeAIDraft).not.toHaveBeenCalled()
    completeAdmission({ queued: true, run_id: 'job-1' })
    await waitFor(() => expect(h.mockReconcileDisputeAIDraft).toHaveBeenCalledWith(before))
    expect(await screen.findByText('Reviewed draft response')).toBeVisible()
  })

  it('keeps a manual rerun pending when an earlier job writes a draft', async () => {
    const before = makeDispute({ ai_drafted_at: '2026-01-01T00:00:00Z' })
    h.mockRerunDisputeAI.mockResolvedValueOnce({ queued: true, run_id: '101' })
    h.mockReconcileDisputeAIDraft.mockResolvedValueOnce(
      makeDispute({
        ai_drafted_at: '2026-01-02T00:00:00Z',
        ai_draft_run_id: '100',
        ai_draft_requested_run_id: '101',
        ai_public_response: 'Earlier job draft',
      }),
    )
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData([before])}
      />,
    )

    fireEvent.click(screen.getByTitle('Re-run AI'))
    await waitFor(() => expect(h.mockReconcileDisputeAIDraft).toHaveBeenCalledOnce())
    expect(screen.queryByText('Earlier job draft')).not.toBeInTheDocument()
    expect(screen.getByTitle('Re-run AI')).toBeDisabled()
  })

  it('reconciles a later run that supersedes the requested draft', async () => {
    const before = makeDispute({ ai_drafted_at: '2026-01-01T00:00:00Z' })
    h.mockRerunDisputeAI.mockResolvedValueOnce({ queued: true, run_id: '101' })
    h.mockReconcileDisputeAIDraft.mockResolvedValueOnce(
      makeDispute({
        ai_drafted_at: '2026-01-02T00:00:00Z',
        ai_draft_run_id: '102',
        ai_draft_requested_run_id: '102',
        ai_public_response: 'Later job draft',
      }),
    )
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData([before])}
      />,
    )

    fireEvent.click(screen.getByTitle('Re-run AI'))
    expect(await screen.findByText('Later job draft')).toBeVisible()
    expect(screen.getByTitle('Re-run AI')).toBeEnabled()
  })

  it('keeps a successfully admitted rerun pending if its first primary read fails', async () => {
    const error = new Error('Primary read failed')
    const consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined)
    h.mockRerunDisputeAI.mockResolvedValueOnce({ queued: true, run_id: 'manual-job' })
    h.mockReconcileDisputeAIDraft.mockRejectedValueOnce(error)
    try {
      render(
        <DisputesClient
          viewerTier='staff'
          data={makeDisputesData()}
        />,
      )
      fireEvent.click(screen.getByTitle('Re-run AI'))
      await waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith('Could not refresh queued dispute draft', error),
      )
      expect(h.mockOnError).not.toHaveBeenCalled()
      expect(screen.getByTitle('Re-run AI')).toBeDisabled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it.each([
    ['approved', { approved_at: '2026-01-02T00:00:00Z' }],
    ['sent', { sent_at: '2026-01-03T00:00:00Z' }],
  ])('does not offer a guaranteed-to-fail AI rerun for a %s dispute', (_state, overrides) => {
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData([makeDispute(overrides)])}
      />,
    )

    expect(screen.getByTitle('Re-run AI')).toBeDisabled()
  })

  it('renders member tier view', () => {
    const memberDispute: ReviewDispute = {
      id: 'dispute-m1',
      post_id: 'post-m1',
      topic_id: 'topic-m1',
      reason: 'privacy_violation',
      status: 'pending',
      post_content: {
        text: 'Some Review',
        declared_language: null,
        lingua_rs_detected_language: null,
      },
      created_at: '2026-01-01T00:00:00Z',
    }
    render(
      <DisputesClient
        viewerTier='member'
        data={makeDisputesData([memberDispute])}
      />,
    )
    expect(screen.getByText('1 dispute')).toBeInTheDocument()
  })

  it('appends the next page with the current filter and preserves stable IDs', async () => {
    h.mockListReviewDisputesClient.mockResolvedValueOnce({
      disputes: [makeDispute(), makeDispute({ id: 'dispute-2' })],
      page_info: { has_next_page: false, end_cursor: null },
    })
    render(
      <DisputesClient
        viewerTier='staff'
        data={{ disputes: [], page_info: { has_next_page: true, end_cursor: 'cursor-abc' } }}
        statusFilter='pending'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      expect(h.mockListReviewDisputesClient).toHaveBeenCalledWith({
        after: 'cursor-abc',
        status: 'pending',
        mine: undefined,
      }),
    )
    expect(screen.getByText('2 disputes')).toBeVisible()
  })

  it('does not render Next page link when end_cursor is null', () => {
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  })

  it('reducer edit_draft branch: updateDisputeDraft is called with edited text', async () => {
    h.mockUpdateDisputeDraft.mockResolvedValueOnce({ dispute: makeDispute() })
    h.mockApproveDispute.mockResolvedValueOnce({ dispute: makeDispute({ approved_at: 'x' }) })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Edit the public response...'), {
      target: { value: 'Updated response' },
    })
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() =>
      expect(h.mockUpdateDisputeDraft).toHaveBeenCalledWith('dispute-1', {
        public_response: 'Updated response',
      }),
    )
    await waitFor(() => expect(h.mockApproveDispute).toHaveBeenCalledWith('dispute-1'))
  })
})
