import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyrightEmailIntakesClientMock as intakesClient,
  copyrightNoticeTargetsClientMock as targetsClient,
} from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  makeCopyrightEmailQueueItem as makeQueueItem,
  makeCopyrightEmailQueuePage as makeQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from '../copyright-email-review'

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  ...targetsClient,
}))

const failedId = '019f0000-0000-7000-8000-0000000000f1'
const bouncedId = '019f0000-0000-7000-8000-0000000000b1'
const waitingSince = '2026-09-20T00:00:00.000Z'

const failed = { ...makeQueueItem(failedId), waiting_reason: 'reply_failed' as const }
const bounced = { ...makeQueueItem(bouncedId), waiting_reason: 'reply_bounced' as const }

function renderQueue(items = [makeQueueItem(), failed, bounced]) {
  return render(<CopyrightEmailReview data={makeQueuePage(items)} />)
}

async function confirmRetry() {
  fireEvent.click(screen.getByRole('button', { name: 'Retry reply' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Send reply again' }))
}

describe('CopyrightEmailReview reply retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    targetsClient.resolveCopyrightNoticeTargets.mockResolvedValue([])
  })

  it('offers a retry only beside a reply that failed to send', () => {
    renderQueue([makeQueueItem(), { ...failed, waiting_since: waitingSince }, bounced])

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Retry reply' })).toHaveLength(1)
    const failedItem = screen.getByText(/could not be sent/).closest('li')
    expect(failedItem).toContainElement(screen.getByRole('button', { name: 'Retry reply' }))
    expect(screen.getByText(/bounced/).closest('li')).not.toContainElement(
      screen.queryByRole('button', { name: 'Retry reply' }),
    )
  })

  it('asks for confirmation before retrying, and sends nothing when it is cancelled', async () => {
    renderQueue()

    fireEvent.click(screen.getByRole('button', { name: 'Retry reply' }))
    expect(await screen.findByText('Send this reply again?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(screen.queryByText('Send this reply again?')).not.toBeInTheDocument(),
    )
    expect(intakesClient.replayCopyrightEmailIntakeReply).not.toHaveBeenCalled()
  })

  it('retries once, reports it, and refreshes the queue', async () => {
    intakesClient.replayCopyrightEmailIntakeReply.mockResolvedValue({ replayed: true })
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(
      makeQueuePage([makeQueueItem(), bounced]),
    )
    renderQueue()

    await confirmRetry()

    expect(
      await screen.findByText('The reply will be sent again to the original sender.'),
    ).toBeInTheDocument()
    expect(intakesClient.replayCopyrightEmailIntakeReply).toHaveBeenCalledExactlyOnceWith(failedId)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(screen.queryByRole('button', { name: 'Retry reply' })).not.toBeInTheDocument()
  })

  it('says when another reviewer already retried the reply, and refreshes the queue', async () => {
    intakesClient.replayCopyrightEmailIntakeReply.mockResolvedValue({ replayed: false })
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(makeQueuePage([makeQueueItem()]))
    renderQueue()

    await confirmRetry()

    expect(
      await screen.findByText('That reply was no longer waiting to be retried.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
  })

  it('shows the server error and keeps the retry available when it fails', async () => {
    intakesClient.replayCopyrightEmailIntakeReply.mockRejectedValue(new Error('Forbidden'))
    renderQueue()

    await confirmRetry()

    expect(await screen.findByText('Review action failed')).toBeInTheDocument()
    expect(screen.getByText('Forbidden')).toBeInTheDocument()
    expect(intakesClient.listCopyrightEmailIntakes).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Retry reply' })).toBeEnabled()
  })

  it('falls back to a plain message when the failure carries none', async () => {
    intakesClient.replayCopyrightEmailIntakeReply.mockRejectedValue('offline')
    renderQueue()

    await confirmRetry()

    expect(await screen.findByText('We could not retry that reply.')).toBeInTheDocument()
  })
})
