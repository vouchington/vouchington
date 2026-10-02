import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyrightEmailIntakesClientMock as intakesClient,
  copyrightNoticeTargetsClientMock as targetsClient,
} from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  copyrightEmailIntakeId as intakeId,
  makeCopyrightEmailIntake as makeIntake,
  makeCopyrightEmailQueueItem as makeQueueItem,
  makeCopyrightEmailQueuePage as makeQueuePage,
  makeMatchedCopyrightEmailIntake as makeMatchedIntake,
  makeMatchedCopyrightEmailQueueItem as makeMatchedQueueItem,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from '../copyright-email-review'

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => targetsClient)

const mockGet = intakesClient.getCopyrightEmailIntake
const mockList = intakesClient.listCopyrightEmailIntakes
const mockRecord = intakesClient.recordCopyrightEmailIntakeLegalProcess

async function selectIntake(id: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(id) }))
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Staff-private evidence' })).toBeInTheDocument()
  })
}

describe('CopyrightEmailReview legal process', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ copyright_email_intake: makeIntake() })
    targetsClient.resolveCopyrightNoticeTargets.mockResolvedValue([])
  })

  it('records legal process for an initial intake and drops it from the queue', async () => {
    mockRecord.mockResolvedValue({ decision: 'legal_process' })
    mockList.mockResolvedValue(makeQueuePage([]))
    render(<CopyrightEmailReview data={makeQueuePage([makeQueueItem()])} />)
    await selectIntake(intakeId)

    fireEvent.click(screen.getByRole('button', { name: 'Record as legal process' }))
    fireEvent.change(screen.getByLabelText('Legal process reason'), {
      target: { value: 'Subpoena for records.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm legal process' }))

    expect(
      await screen.findByText('The email intake was recorded as legal process. No reply was sent.'),
    ).toBeVisible()
    expect(mockRecord).toHaveBeenCalledExactlyOnceWith(intakeId, 'Subpoena for records.')
    expect(screen.queryByRole('heading', { name: 'Staff-private evidence' })).toBeNull()
    expect(screen.queryByRole('button', { name: new RegExp(intakeId) })).toBeNull()
    expect(screen.getByText('No copyright emails need review.')).toBeVisible()
  })

  it('says so when the decision was recorded but the queue could not be reloaded', async () => {
    mockRecord.mockResolvedValue({ decision: 'legal_process' })
    mockList.mockRejectedValue(new Error('offline'))
    render(<CopyrightEmailReview data={makeQueuePage([makeQueueItem()])} />)
    await selectIntake(intakeId)

    fireEvent.click(screen.getByRole('button', { name: 'Record as legal process' }))
    fireEvent.change(screen.getByLabelText('Legal process reason'), {
      target: { value: 'Subpoena for records.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm legal process' }))

    expect(
      await screen.findByText('The decision was recorded, but the queue could not be reloaded.'),
    ).toBeVisible()
  })

  it('offers no legal-process action on a matched thread reply', async () => {
    mockGet.mockResolvedValue({ copyright_email_intake: makeMatchedIntake() })
    const matched = makeMatchedQueueItem()
    render(<CopyrightEmailReview data={makeQueuePage([matched])} />)

    await selectIntake(matched.id)

    expect(screen.queryByRole('button', { name: 'Record as legal process' })).toBeNull()
  })
})
