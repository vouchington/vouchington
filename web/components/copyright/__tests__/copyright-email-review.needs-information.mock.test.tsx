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
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  ...targetsClient,
}))

const mockGet = intakesClient.getCopyrightEmailIntake
const mockList = intakesClient.listCopyrightEmailIntakes
const mockReject = intakesClient.rejectCopyrightEmailIntake
const mockRequest = intakesClient.requestCopyrightEmailIntakeInformation
const recommendationId = '019f0000-0000-7000-8000-000000000002'
const otherIntakeId = '019f0000-0000-7000-8000-000000000007'
const rationale = 'The notice is missing the infringing URLs.'
const message = 'Please identify the copyrighted work and each allegedly infringing URL.'

function unparsedIntake(id = intakeId) {
  return { ...makeIntake(id), parsed_email: null, parser_error: 'The MIME body is corrupt.' }
}

describe('CopyrightEmailReview request information', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(makeQueuePage())
    mockGet.mockResolvedValue({ copyright_email_intake: makeIntake() })
    targetsClient.resolveCopyrightNoticeTargets.mockResolvedValue([])
  })

  it('sends the trimmed message as a needs-information request and reports the queued reply', async () => {
    mockRequest.mockResolvedValue({ reply_queued: true })
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()
    fillRationale()
    fillMessage(`  ${message}\n`)
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }))

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(intakeId, {
        rationale,
        recommendation_id: recommendationId,
        manual_fallback_reason: null,
        reply_email: null,
        response_message: message,
      })
    })
    expect(
      await screen.findByText('The information request was recorded. A reply was queued.'),
    ).toBeInTheDocument()
    expect(mockReject).not.toHaveBeenCalled()
  })

  it('sends the typed address for an intake with no parsed sender and says when no reply went out', async () => {
    const queue = makeQueuePage([makeQueueItem(), makeQueueItem(otherIntakeId)])
    mockList.mockResolvedValue(queue)
    mockGet.mockResolvedValueOnce({ copyright_email_intake: unparsedIntake() })
    mockGet.mockResolvedValueOnce({ copyright_email_intake: unparsedIntake(otherIntakeId) })
    mockRequest.mockResolvedValueOnce({ reply_queued: true })
    mockRequest.mockResolvedValueOnce({ reply_queued: false })
    render(<CopyrightEmailReview data={queue} />)

    await selectEmailIntake()
    fillRationale()
    fillMessage(message)
    fireEvent.change(screen.getByLabelText('Reply address'), {
      target: { value: ' reporter@example.test ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }))
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(
        intakeId,
        expect.objectContaining({ reply_email: 'reporter@example.test' }),
      )
    })
    await screen.findByText('The information request was recorded. A reply was queued.')

    await selectEmailIntake(otherIntakeId)
    fillRationale()
    fillMessage(message)
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }))

    expect(
      await screen.findByText('The information request was recorded. No reply sent.'),
    ).toBeInTheDocument()
    expect(mockRequest).toHaveBeenLastCalledWith(
      otherIntakeId,
      expect.objectContaining({ reply_email: null }),
    )
  })

  it('blocks the request until there is a message', async () => {
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()
    fillRationale()
    const request = screen.getByRole('button', { name: 'Request information' })
    expect(request).toBeDisabled()

    fillMessage(' \n\t ')
    expect(request).toBeDisabled()
    expect(screen.getByText('0 / 10,000')).toBeInTheDocument()

    fillMessage(message)
    expect(request).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Review rationale'), { target: { value: ' ' } })
    expect(request).toBeDisabled()
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('blocks a message over 10,000 characters and says so', async () => {
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()
    fillRationale()
    fillMessage('a'.repeat(10_001))

    expect(screen.getByRole('button', { name: 'Request information' })).toBeDisabled()
    expect(screen.getByText('10,001 / 10,000')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The message must be 10,000 characters or fewer.',
    )

    fillMessage('a'.repeat(10_000))

    expect(screen.getByRole('button', { name: 'Request information' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the typed message when the request fails and clears it for another intake', async () => {
    mockRequest.mockRejectedValue(new Error('Needs-information responses require a message'))
    mockGet.mockResolvedValueOnce({ copyright_email_intake: makeIntake() })
    mockGet.mockResolvedValueOnce({ copyright_email_intake: makeIntake(otherIntakeId) })
    render(
      <CopyrightEmailReview
        data={makeQueuePage([makeQueueItem(), makeQueueItem(otherIntakeId)])}
      />,
    )

    await selectEmailIntake()
    fillRationale()
    fillMessage(message)
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }))
    expect(
      await screen.findByText('Needs-information responses require a message'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Information request message')).toHaveValue(message)

    await selectEmailIntake(otherIntakeId)

    expect(screen.getByLabelText('Information request message')).toHaveValue('')
  })

  it('does not offer the action on a matched correspondence review', async () => {
    mockList.mockResolvedValue(makeQueuePage([makeMatchedQueueItem()]))
    mockGet.mockResolvedValue({ copyright_email_intake: makeMatchedIntake() })
    render(<CopyrightEmailReview data={makeQueuePage([makeMatchedQueueItem()])} />)

    await selectEmailIntake()

    expect(screen.getByRole('button', { name: 'Reject correspondence' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request information' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Information request message')).not.toBeInTheDocument()
  })
})

function fillRationale() {
  fireEvent.change(screen.getByLabelText('Review rationale'), { target: { value: rationale } })
}

function fillMessage(value: string) {
  fireEvent.change(screen.getByLabelText('Information request message'), { target: { value } })
}

async function selectEmailIntake(id = intakeId) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(id) }))
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Staff-private evidence' })).toBeInTheDocument()
  })
}
