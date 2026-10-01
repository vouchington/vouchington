import { configure, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  makeCopyrightEmailQueueItem as makeQueueItem,
  makeCopyrightEmailQueuePage as makeQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from './copyright-email-review'

configure({ testIdAttribute: 'data-pw' })

const failedId = '019f0000-0000-7000-8000-000000000011'
const bouncedId = '019f0000-0000-7000-8000-000000000012'

describe('CopyrightEmailReview reply failures', () => {
  it('lists an intake whose reply failed or bounced with the reason and how long it has waited', () => {
    render(
      <CopyrightEmailReview
        data={makeQueuePage([
          makeQueueItem(),
          {
            ...makeQueueItem(failedId),
            waiting_reason: 'reply_failed',
            waiting_since: '2026-09-20T00:00:00.000Z',
          },
          {
            ...makeQueueItem(bouncedId),
            waiting_reason: 'reply_bounced',
            waiting_since: '2026-09-21T00:00:00.000Z',
          },
        ])}
      />,
    )

    const failed = screen.getByText(/could not be sent/)
    expect(failed.querySelector('time')).toHaveAttribute('dateTime', '2026-09-20T00:00:00.000Z')
    const bounced = screen.getByText(/bounced/)
    expect(bounced.querySelector('time')).toHaveAttribute('dateTime', '2026-09-21T00:00:00.000Z')
    expect(screen.getAllByText(/^Received/)).toHaveLength(3)
    expect(screen.getAllByText(/Reply to the sender/)).toHaveLength(2)
  })
})
