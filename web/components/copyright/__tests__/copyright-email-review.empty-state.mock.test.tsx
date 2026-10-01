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
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from '../copyright-email-review'

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => targetsClient)

const emptyMessage = 'No copyright emails need review.'

describe('CopyrightEmailReview empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    targetsClient.resolveCopyrightNoticeTargets.mockResolvedValue([])
  })

  it('says so when no emails are waiting for review', () => {
    render(<CopyrightEmailReview data={makeQueuePage([])} />)

    expect(screen.getByText(emptyMessage)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Copyright email review' })).toBeInTheDocument()
  })

  it('does not claim the queue is empty while it still has queued emails', () => {
    render(<CopyrightEmailReview data={makeQueuePage([makeQueueItem()])} />)

    expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('keeps the review result visible after the last queued email is cleared', async () => {
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(makeQueuePage([]))
    intakesClient.getCopyrightEmailIntake.mockResolvedValue({
      copyright_email_intake: makeIntake(),
    })
    intakesClient.rejectCopyrightEmailIntake.mockResolvedValue({ reply_queued: true })
    render(<CopyrightEmailReview data={makeQueuePage([makeQueueItem()])} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(intakeId) }))
    fireEvent.change(await screen.findByLabelText('Review rationale'), {
      target: { value: 'Not a copyright notice.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject email intake' }))

    await waitFor(() => expect(screen.getByText(emptyMessage)).toBeInTheDocument())
    expect(
      screen.getByText('The email intake was rejected. A reply was queued.'),
    ).toBeInTheDocument()
  })
})
