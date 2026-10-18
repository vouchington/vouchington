import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  mockApproveDispute: vi.fn<VitestLooseMock>(),
  mockSendDisputeResolution: vi.fn<VitestLooseMock>(),
  mockResolveDisputeRemove: vi.fn<VitestLooseMock>(),
  mockResolveDisputeAnnotate: vi.fn<VitestLooseMock>(),
  mockDismissDispute: vi.fn<VitestLooseMock>(),
  mockRerunDisputeAI: vi.fn<VitestLooseMock>(),
  mockReconcileDisputeAIDraft: vi.fn<VitestLooseMock>(),
  mockUpdateDisputeDraft: vi.fn<VitestLooseMock>(),
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
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: h.mockOnError }))

import { DisputesClient } from './disputes-client'
import { makeDispute, makeDisputesData } from './fixtures/disputes-client-fixtures'

describe('DisputesClient — rendering and staff actions', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps polling within the original deadline while a superseding run is still pending', async () => {
    const before = makeDispute({ ai_drafted_at: '2026-01-01T00:00:00Z' })
    h.mockRerunDisputeAI.mockResolvedValueOnce({ queued: true, run_id: 'request-101' })
    h.mockReconcileDisputeAIDraft.mockResolvedValueOnce(
      makeDispute({
        ai_draft_run_id: 'earlier-result',
        ai_draft_requested_run_id: 'request-102',
        ai_public_response: 'Draft from an earlier request',
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
    expect(screen.queryByText('Draft from an earlier request')).not.toBeInTheDocument()
    expect(screen.getByTitle('Re-run AI')).toBeDisabled()
  })

  it('reconciles an approved dispute while its AI rerun is pending', async () => {
    const before = makeDispute({ ai_drafted_at: null })
    h.mockRerunDisputeAI.mockResolvedValueOnce({ queued: true, run_id: 'request-101' })
    h.mockReconcileDisputeAIDraft.mockResolvedValueOnce(
      makeDispute({
        approved_at: '2026-01-02T00:00:00Z',
        ai_draft_run_id: null,
        ai_draft_requested_run_id: 'request-101',
      }),
    )
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData([before])}
      />,
    )

    fireEvent.click(screen.getByTitle('Re-run AI'))
    await waitFor(() => expect(screen.getByRole('button', { name: /send/i })).toBeEnabled())
    expect(h.mockReconcileDisputeAIDraft).toHaveBeenCalledOnce()
    expect(screen.getByTitle('Re-run AI')).toBeDisabled()
  })

  it('renders the dispute count', () => {
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    expect(screen.getByText('1 dispute')).toBeInTheDocument()
  })

  it('renders plural dispute count', () => {
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData([makeDispute(), makeDispute({ id: 'dispute-2' })])}
      />,
    )
    expect(screen.getByText('2 disputes')).toBeInTheDocument()
  })

  it('has data-pw attribute', () => {
    const { container } = render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    expect(container.querySelector('[data-pw="disputes-list"]')).not.toBeNull()
  })

  it('calls approveDispute when Approve is clicked', async () => {
    h.mockApproveDispute.mockResolvedValueOnce({ dispute: makeDispute({ approved_at: 'x' }) })
    h.mockUpdateDisputeDraft.mockResolvedValueOnce({ dispute: makeDispute() })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() => expect(h.mockApproveDispute).toHaveBeenCalledWith('dispute-1'))
  })

  it('calls sendDisputeResolution when Send is clicked', async () => {
    const approved = makeDispute({ approved_at: 'x', sent_at: null })
    h.mockSendDisputeResolution.mockResolvedValueOnce({ dispute: makeDispute({ sent_at: 'y' }) })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData([approved])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(h.mockSendDisputeResolution).toHaveBeenCalledWith('dispute-1'))
  })

  it('calls rerunDisputeAI when Re-run AI is clicked', async () => {
    h.mockRerunDisputeAI.mockResolvedValueOnce({ queued: true, run_id: 'job-1' })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    fireEvent.click(screen.getByTitle('Re-run AI'))
    await waitFor(() => expect(h.mockRerunDisputeAI).toHaveBeenCalledWith('dispute-1'))
  })

  it('calls resolveDisputeRemove when Remove is clicked', async () => {
    h.mockResolveDisputeRemove.mockResolvedValueOnce({
      dispute: makeDispute({ status: 'resolved' }),
    })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    await waitFor(() =>
      expect(h.mockResolveDisputeRemove).toHaveBeenCalledWith('dispute-1', 'remove'),
    )
  })

  it('calls dismissDispute when Dismiss is clicked', async () => {
    h.mockDismissDispute.mockResolvedValueOnce({ dispute: makeDispute({ status: 'dismissed' }) })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    await waitFor(() => expect(h.mockDismissDispute).toHaveBeenCalledWith('dispute-1'))
  })

  it('calls resolveDisputeAnnotate when Annotate is clicked', async () => {
    h.mockResolveDisputeAnnotate.mockResolvedValueOnce({
      dispute: makeDispute({ status: 'resolved' }),
    })
    render(
      <DisputesClient
        viewerTier='staff'
        data={makeDisputesData()}
      />,
    )
    fireEvent.click(screen.getByTitle('Attach the response above as a public rebuttal'))
    await waitFor(() =>
      expect(h.mockResolveDisputeAnnotate).toHaveBeenCalledWith('dispute-1', 'Some response'),
    )
  })
})
