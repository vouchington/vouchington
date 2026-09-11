import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  mockApproveDispute: vi.fn<VitestLooseMock>(),
  mockSendDisputeResolution: vi.fn<VitestLooseMock>(),
  mockResolveDisputeRemove: vi.fn<VitestLooseMock>(),
  mockResolveDisputeAnnotate: vi.fn<VitestLooseMock>(),
  mockDismissDispute: vi.fn<VitestLooseMock>(),
  mockRerunDisputeAI: vi.fn<VitestLooseMock>(),
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
  updateDisputeDraft: h.mockUpdateDisputeDraft,
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: h.mockOnError }))

import { DisputesClient } from './disputes-client'
import { makeDispute, makeDisputesData } from './fixtures/disputes-client-fixtures'

describe('DisputesClient — rendering and staff actions', () => {
  afterEach(() => {
    vi.clearAllMocks()
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
    h.mockRerunDisputeAI.mockResolvedValueOnce(undefined)
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
