import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyrightEmailIntakesClientMock as intakesClient } from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  copyrightEmailIntakeId as intakeId,
  makeCopyrightEmailQueuePage as makeQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'
import { CopyrightEmailLegalProcessAction } from './copyright-email-legal-process-action'

configure({ testIdAttribute: 'data-pw' })

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)

const mockRecord = intakesClient.recordCopyrightEmailIntakeLegalProcess
const mockList = intakesClient.listCopyrightEmailIntakes

function renderAction(
  overrides: { review_path?: 'initial' | 'unresolved_thread' | 'matched_thread' } = {},
) {
  const onRecorded = vi.fn<(queue: CopyrightEmailIntakeQueuePage | null) => void>()
  render(
    <CopyrightEmailLegalProcessAction
      detail={{ id: intakeId, review_path: 'initial', ...overrides }}
      disabled={false}
      onRecorded={onRecorded}
    />,
  )
  return onRecorded
}

function openConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: 'Record as legal process' }))
}

function typeReason(value: string) {
  fireEvent.change(screen.getByLabelText('Legal process reason'), { target: { value } })
}

describe('CopyrightEmailLegalProcessAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(makeQueuePage([]))
  })

  it.each(['unresolved_thread', 'matched_thread'] as const)(
    'offers nothing for a %s review',
    review_path => {
      renderAction({ review_path })

      expect(screen.queryByText('Legal process')).not.toBeInTheDocument()
    },
  )

  it('asks for a reason before it records anything, and cancel discards it', () => {
    renderAction()

    openConfirmation()
    const confirm = screen.getByRole('button', { name: 'Confirm legal process' })
    expect(confirm).toBeDisabled()
    typeReason('   ')
    expect(confirm).toBeDisabled()
    typeReason('Subpoena for records.')
    expect(confirm).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockRecord).not.toHaveBeenCalled()
    openConfirmation()
    expect(screen.getByLabelText('Legal process reason')).toHaveValue('')
  })

  it('refuses a reason longer than the server accepts', () => {
    renderAction()

    openConfirmation()
    typeReason('x'.repeat(1_001))

    expect(screen.getByRole('button', { name: 'Confirm legal process' })).toBeDisabled()
    expect(screen.getByLabelText('Legal process reason')).toBeInvalid()
  })

  it('records the trimmed reason, then hands back the refreshed queue', async () => {
    const queue = makeQueuePage([])
    mockRecord.mockResolvedValue({ decision: 'legal_process' })
    mockList.mockResolvedValue(queue)
    const onRecorded = renderAction()

    openConfirmation()
    typeReason('  Subpoena for records.  ')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm legal process' }))

    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith(queue))
    expect(mockRecord).toHaveBeenCalledExactlyOnceWith(intakeId, 'Subpoena for records.')
  })

  it('still reports the decision when the queue cannot be reloaded', async () => {
    mockRecord.mockResolvedValue({ decision: 'legal_process' })
    mockList.mockRejectedValue(new Error('offline'))
    const onRecorded = renderAction()

    openConfirmation()
    typeReason('Subpoena for records.')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm legal process' }))

    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith(null))
  })

  it('shows the server refusal and keeps the typed reason when recording fails', async () => {
    mockRecord.mockRejectedValue(new Error('Copyright email intake was already decided'))
    const onRecorded = renderAction()

    openConfirmation()
    typeReason('Subpoena for records.')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm legal process' }))

    expect(await screen.findByText('Copyright email intake was already decided')).toBeVisible()
    expect(screen.getByLabelText('Legal process reason')).toHaveValue('Subpoena for records.')
    expect(onRecorded).not.toHaveBeenCalled()
    expect(mockList).not.toHaveBeenCalled()
  })
})
