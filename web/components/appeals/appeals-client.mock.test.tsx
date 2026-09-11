import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import esMessages from '@ts-shared/ui-messages/messages/es'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'

const h = vi.hoisted(() => ({
  AppealDraftReconciliationTimeoutError: class extends Error {},
  mockApproveAppeal: vi.fn<VitestLooseMock>(),
  mockSendAppealResolution: vi.fn<VitestLooseMock>(),
  mockResolveAppeal: vi.fn<VitestLooseMock>(),
  mockEnqueueAppealAIDraftRerun: vi.fn<VitestLooseMock>(),
  mockReconcileAppealAIDraft: vi.fn<VitestLooseMock>(),
  mockUpdateAppealDraft: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockListModerationAppealsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/appeals'), () => ({
  AppealDraftReconciliationTimeoutError: h.AppealDraftReconciliationTimeoutError,
  approveAppeal: h.mockApproveAppeal,
  sendAppealResolution: h.mockSendAppealResolution,
  resolveAppeal: h.mockResolveAppeal,
  enqueueAppealAIDraftRerun: h.mockEnqueueAppealAIDraftRerun,
  reconcileAppealAIDraft: h.mockReconcileAppealAIDraft,
  updateAppealDraft: h.mockUpdateAppealDraft,
  listModerationAppealsClient: h.mockListModerationAppealsClient,
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: h.mockOnError }))

import { AppealsClient } from './appeals-client'
import { makeAppeal, makeAppealsData } from './fixtures/appeals-client-fixtures'

function renderStaffClient(data = makeAppealsData(), uiLocale = 'en') {
  return render(
    <UiLocaleProvider uiLocale={uiLocale}>
      <AppealsClient
        viewerTier='staff'
        viewerRole='administrator'
        data={data}
      />
    </UiLocaleProvider>,
  )
}

describe('AppealsClient — rendering and staff actions', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders the appeal count', () => {
    renderStaffClient()
    expect(screen.getByText('1 appeal')).toBeInTheDocument()
  })

  it('renders the plural appeal count in English', () => {
    renderStaffClient(makeAppealsData([makeAppeal(), makeAppeal({ id: 'appeal-2' })]))
    expect(screen.getByText('2 appeals')).toBeInTheDocument()
  })

  it('renders the plural appeal count in the resolved UI locale', () => {
    seedMessages('es', esMessages)
    renderStaffClient(makeAppealsData([makeAppeal(), makeAppeal({ id: 'appeal-2' })]), 'es')

    expect(screen.getByText('2 apelaciones')).toBeInTheDocument()
    expect(screen.queryByText('2 appeals')).not.toBeInTheDocument()
  })

  it('has data-pw attribute', () => {
    const { container } = renderStaffClient()
    expect(container.querySelector('[data-pw="appeals-list"]')).not.toBeNull()
  })

  it('calls approveAppeal when Approve is clicked', async () => {
    h.mockApproveAppeal.mockResolvedValueOnce({ appeal: makeAppeal({ approved_at: 'x' }) })
    h.mockUpdateAppealDraft.mockResolvedValueOnce({ appeal: makeAppeal() })
    renderStaffClient()
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() => expect(h.mockApproveAppeal).toHaveBeenCalledWith('appeal-1'))
  })

  it('calls onError when approveAppeal fails', async () => {
    const err = new Error('Network error')
    h.mockApproveAppeal.mockRejectedValueOnce(err)
    h.mockUpdateAppealDraft.mockResolvedValueOnce({ appeal: makeAppeal() })
    renderStaffClient()
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() => expect(h.mockOnError).toHaveBeenCalled())
  })

  it('updates public_response in state when draft is edited', () => {
    renderStaffClient()
    const textarea = screen.getByPlaceholderText('Edit the public response...')
    fireEvent.change(textarea, { target: { value: 'Updated draft text' } })
    expect((textarea as HTMLTextAreaElement).value).toBe('Updated draft text')
  })

  it('calls sendAppealResolution when Send is clicked', async () => {
    h.mockSendAppealResolution.mockResolvedValueOnce({ appeal: makeAppeal({ sent_at: 'x' }) })
    const approvedAppeal = makeAppeal({ approved_at: '2026-01-02T00:00:00Z', sent_at: null })
    renderStaffClient(makeAppealsData([approvedAppeal]))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(h.mockSendAppealResolution).toHaveBeenCalledWith('appeal-1'))
  })

  it('replaces the row only with the authoritative appeal returned after Re-run AI is queued', async () => {
    const appeal = makeAppeal({
      ai_drafted_at: '2026-01-01T00:00:00.000Z',
      latest_lifecycle_change_id: 'change-1',
    })
    h.mockEnqueueAppealAIDraftRerun.mockResolvedValueOnce(undefined)
    h.mockReconcileAppealAIDraft.mockResolvedValueOnce({
      appeal: makeAppeal({
        ai_drafted_at: '2026-01-01T00:01:00.000Z',
        latest_lifecycle_change_id: 'change-2',
        ai_public_response: 'Authoritative AI draft',
      }),
    })
    renderStaffClient(makeAppealsData([appeal]))
    fireEvent.click(screen.getByTitle('Re-run AI'))
    await waitFor(() => expect(h.mockEnqueueAppealAIDraftRerun).toHaveBeenCalledWith('appeal-1'))
    expect(h.mockReconcileAppealAIDraft).toHaveBeenCalledWith(appeal)
    expect(await screen.findByText('Authoritative AI draft')).toBeInTheDocument()
  })

  it('keeps other appeal rows actionable while a rerun is reconciling', async () => {
    const firstAppeal = makeAppeal({ id: 'appeal-1' })
    const secondAppeal = makeAppeal({ id: 'appeal-2' })
    const firstReconciliation = Promise.withResolvers<{ appeal: ReturnType<typeof makeAppeal> }>()
    const secondReconciliation = Promise.withResolvers<{ appeal: ReturnType<typeof makeAppeal> }>()
    h.mockEnqueueAppealAIDraftRerun.mockResolvedValue(undefined)
    h.mockReconcileAppealAIDraft.mockImplementation(appeal =>
      appeal.id === firstAppeal.id ? firstReconciliation.promise : secondReconciliation.promise,
    )
    renderStaffClient(makeAppealsData([firstAppeal, secondAppeal]))

    const [firstRerunButton, secondRerunButton] = screen.getAllByTitle('Re-run AI')
    const [firstResponse, secondResponse] = screen.getAllByPlaceholderText(
      'Edit the public response...',
    )
    if (!firstRerunButton || !secondRerunButton || !firstResponse || !secondResponse) {
      throw new Error('Expected rerun and response controls for each appeal')
    }
    fireEvent.click(firstRerunButton)

    await waitFor(() => expect(firstRerunButton).toBeDisabled())
    expect(firstResponse).toBeDisabled()
    expect(secondRerunButton).toBeEnabled()
    expect(secondResponse).toBeEnabled()
    fireEvent.click(secondRerunButton)
    await waitFor(() =>
      expect(h.mockEnqueueAppealAIDraftRerun).toHaveBeenCalledWith(secondAppeal.id),
    )

    firstReconciliation.resolve({ appeal: firstAppeal })
    secondReconciliation.resolve({ appeal: secondAppeal })
  })

  it('replaces a local draft with the authoritative rerun response before approving', async () => {
    const appeal = makeAppeal({
      ai_drafted_at: '2026-01-01T00:00:00.000Z',
      latest_lifecycle_change_id: 'change-1',
    })
    h.mockEnqueueAppealAIDraftRerun.mockResolvedValueOnce(undefined)
    h.mockReconcileAppealAIDraft.mockResolvedValueOnce({
      appeal: makeAppeal({
        ai_drafted_at: '2026-01-01T00:01:00.000Z',
        latest_lifecycle_change_id: 'change-2',
        ai_public_response: 'Authoritative AI draft',
        public_response: 'Authoritative public response',
      }),
    })
    h.mockApproveAppeal.mockResolvedValueOnce({ appeal: makeAppeal({ approved_at: 'x' }) })
    renderStaffClient(makeAppealsData([appeal]))

    const textarea = screen.getByPlaceholderText('Edit the public response...')
    fireEvent.change(textarea, { target: { value: 'Stale local response' } })
    fireEvent.click(screen.getByTitle('Re-run AI'))

    await waitFor(() =>
      expect((textarea as HTMLTextAreaElement).value).toBe('Authoritative public response'),
    )
    expect(screen.queryByDisplayValue('Stale local response')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() => expect(h.mockApproveAppeal).toHaveBeenCalledWith('appeal-1'))
    expect(h.mockUpdateAppealDraft).not.toHaveBeenCalled()
  })

  it('reuses a queued rerun after a read failure but replaces it after polling times out', async () => {
    const appeal = makeAppeal({
      ai_drafted_at: '2026-01-01T00:00:00.000Z',
      latest_lifecycle_change_id: 'change-1',
    })
    h.mockEnqueueAppealAIDraftRerun.mockResolvedValueOnce(undefined)
    h.mockReconcileAppealAIDraft
      .mockRejectedValueOnce(new Error('read failed'))
      .mockRejectedValueOnce(new h.AppealDraftReconciliationTimeoutError('timed out'))
      .mockResolvedValueOnce({
        appeal: makeAppeal({
          ai_drafted_at: '2026-01-01T00:01:00.000Z',
          latest_lifecycle_change_id: 'change-2',
          ai_public_response: 'Reconciled AI draft',
        }),
      })
    renderStaffClient(makeAppealsData([appeal]))

    fireEvent.click(screen.getByTitle('Re-run AI'))
    await waitFor(() => expect(h.mockOnError).toHaveBeenCalled())
    fireEvent.click(screen.getByTitle('Re-run AI'))

    await waitFor(() => expect(h.mockReconcileAppealAIDraft).toHaveBeenCalledTimes(2))
    expect(h.mockEnqueueAppealAIDraftRerun).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTitle('Re-run AI'))

    await waitFor(() => expect(h.mockReconcileAppealAIDraft).toHaveBeenCalledTimes(3))
    expect(h.mockEnqueueAppealAIDraftRerun).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Reconciled AI draft')).toBeInTheDocument()
  })

  it('calls resolveAppeal with accept when Accept is clicked', async () => {
    h.mockResolveAppeal.mockResolvedValueOnce({
      appeal: makeAppeal({
        status: 'resolved',
        approved_at: '2026-01-02T00:00:00Z',
        sent_at: '2026-01-03T00:00:00Z',
        resolved_at: '2026-01-04T00:00:00Z',
        resolution_action: 'accept',
      }),
    })
    renderStaffClient(
      makeAppealsData([
        makeAppeal({
          approved_at: '2026-01-02T00:00:00Z',
          sent_at: '2026-01-03T00:00:00Z',
        }),
      ]),
    )
    fireEvent.click(screen.getByRole('button', { name: /accept/i }))
    await waitFor(() => expect(h.mockResolveAppeal).toHaveBeenCalledWith('appeal-1', 'accept'))
  })

  it('calls updateAppealDraft then approveAppeal when draft edited then Approve clicked', async () => {
    h.mockUpdateAppealDraft.mockResolvedValueOnce({ appeal: makeAppeal() })
    h.mockApproveAppeal.mockResolvedValueOnce({ appeal: makeAppeal({ approved_at: 'x' }) })
    renderStaffClient()
    const textarea = screen.getByPlaceholderText('Edit the public response...')
    fireEvent.change(textarea, { target: { value: 'New draft' } })
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() => expect(h.mockUpdateAppealDraft).toHaveBeenCalled())
    await waitFor(() => expect(h.mockApproveAppeal).toHaveBeenCalledWith('appeal-1'))
  })

  it('calls onError when updateAppealDraft fails and skips approve', async () => {
    h.mockUpdateAppealDraft.mockRejectedValueOnce(new Error('save failed'))
    renderStaffClient()
    const textarea = screen.getByPlaceholderText('Edit the public response...')
    fireEvent.change(textarea, { target: { value: 'New draft' } })
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    await waitFor(() => expect(h.mockOnError).toHaveBeenCalled())
    expect(h.mockApproveAppeal).not.toHaveBeenCalled()
  })
})
