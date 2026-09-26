import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyrightEmailIntakesClientMock as intakesClient,
  copyrightNoticeTargetsClientMock as targetsClient,
} from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  copyrightEmailIntakeId as firstId,
  makeCopyrightEmailIntake as makeIntake,
  makeCopyrightEmailQueueItem as makeQueueItem,
  makeCopyrightEmailQueuePage as makeQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from '../copyright-email-review'

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => targetsClient)

const mockGet = intakesClient.getCopyrightEmailIntake
const mockList = intakesClient.listCopyrightEmailIntakes
const mockReject = intakesClient.rejectCopyrightEmailIntake
const mockResolveTargets = targetsClient.resolveCopyrightNoticeTargets
const secondId = '019f0000-0000-7000-8000-000000000011'
const refreshedId = '019f0000-0000-7000-8000-000000000012'

describe('CopyrightEmailReview pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveTargets.mockResolvedValue([])
  })

  it('continues the server-rendered page from its cursor and lists each intake once', async () => {
    mockList.mockResolvedValue(makeQueuePage([makeQueueItem(firstId), makeQueueItem(secondId)]))
    render(<CopyrightEmailReview data={firstPage()} />)

    expect(queueIntakeIds()).toEqual([firstId])
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(queueIntakeIds()).toEqual([firstId, secondId]))
    expect(mockList).toHaveBeenCalledWith({ after: 'next' })
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('keeps a failed continuation retryable', async () => {
    mockList
      .mockRejectedValueOnce(new Error('The queue page is unavailable'))
      .mockResolvedValueOnce(makeQueuePage([makeQueueItem(secondId)]))
    render(<CopyrightEmailReview data={firstPage()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Failed to load more')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(queueIntakeIds()).toEqual([firstId, secondId]))
    expect(mockList).toHaveBeenNthCalledWith(2, { after: 'next' })
  })

  it('replaces every loaded page with the refreshed first page after a review', async () => {
    mockList
      .mockResolvedValueOnce(makeQueuePage([makeQueueItem(secondId)]))
      .mockResolvedValueOnce(makeQueuePage([makeQueueItem(refreshedId)]))
    mockGet.mockResolvedValue({ copyright_email_intake: makeIntake(firstId) })
    mockReject.mockResolvedValue(undefined)
    render(<CopyrightEmailReview data={firstPage()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(queueIntakeIds()).toEqual([firstId, secondId]))

    fireEvent.click(screen.getByRole('button', { name: new RegExp(firstId) }))
    fireEvent.change(await screen.findByLabelText('Review rationale'), {
      target: { value: 'Not a copyright notice.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject email intake' }))

    await waitFor(() => expect(queueIntakeIds()).toEqual([refreshedId]))
    expect(mockList).toHaveBeenLastCalledWith()
    expect(screen.getByText('The email intake was rejected.')).toBeInTheDocument()
  })
})

function firstPage() {
  return makeQueuePage([makeQueueItem(firstId)], { has_next_page: true, end_cursor: 'next' })
}

function queueIntakeIds() {
  return screen
    .getAllByRole('button', { name: /^Initial intake / })
    .map(button => button.textContent?.replace('Initial intake ', ''))
}
