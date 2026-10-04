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
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  ...targetsClient,
}))

const mockGet = intakesClient.getCopyrightEmailIntake
const mockList = intakesClient.listCopyrightEmailIntakes
const mockReject = intakesClient.rejectCopyrightEmailIntake
const recommendationId = '019f0000-0000-7000-8000-000000000002'
const otherIntakeId = '019f0000-0000-7000-8000-000000000007'

function unparsedIntake(id = intakeId) {
  return { ...makeIntake(id), parsed_email: null, parser_error: 'The MIME body is corrupt.' }
}

describe('CopyrightEmailReview reply address', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(makeQueuePage())
    targetsClient.resolveCopyrightNoticeTargets.mockResolvedValue([])
  })

  it('sends the typed address for an intake with no parsed sender and reports the queued reply', async () => {
    mockGet.mockResolvedValue({ copyright_email_intake: unparsedIntake() })
    mockReject.mockResolvedValue({ reply_queued: true })
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()
    fireEvent.change(screen.getByLabelText('Reply address'), {
      target: { value: ' reporter@example.test ' },
    })
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'The message is not a copyright notice.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject email intake' }))

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith(
        intakeId,
        'The message is not a copyright notice.',
        recommendationId,
        null,
        'reporter@example.test',
      )
    })
    expect(
      await screen.findByText('The email intake was rejected. A reply was queued.'),
    ).toBeInTheDocument()
  })

  it('tells staff when the rejection queued no reply', async () => {
    mockGet.mockResolvedValue({ copyright_email_intake: unparsedIntake() })
    mockReject.mockResolvedValue({ reply_queued: false })
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'The message is not a copyright notice.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject email intake' }))

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith(
        intakeId,
        'The message is not a copyright notice.',
        recommendationId,
        null,
        null,
      )
    })
    expect(
      await screen.findByText('The email intake was rejected. No reply sent.'),
    ).toBeInTheDocument()
  })

  it('does not offer the field when the intake has a parsed sender', async () => {
    mockGet.mockResolvedValue({ copyright_email_intake: makeIntake() })
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()

    expect(screen.queryByLabelText('Reply address')).not.toBeInTheDocument()
  })

  it('clears the typed address before selecting another intake', async () => {
    mockGet.mockResolvedValueOnce({ copyright_email_intake: unparsedIntake() })
    mockGet.mockResolvedValueOnce({ copyright_email_intake: unparsedIntake(otherIntakeId) })
    render(
      <CopyrightEmailReview
        data={makeQueuePage([makeQueueItem(), makeQueueItem(otherIntakeId)])}
      />,
    )

    await selectEmailIntake(intakeId)
    fireEvent.change(screen.getByLabelText('Reply address'), {
      target: { value: 'first@example.test' },
    })
    await selectEmailIntake(otherIntakeId)

    expect(screen.getByLabelText('Reply address')).toHaveValue('')
  })
})

async function selectEmailIntake(id = intakeId) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(id) }))
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Staff-private evidence' })).toBeInTheDocument()
  })
}
