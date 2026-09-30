import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => targetsClient)

describe('CopyrightEmailReview parse state', () => {
  it('flags queued emails whose parse failed or was never recorded', () => {
    const page = makeQueuePage([
      makeQueueItem(),
      { ...makeQueueItem('019f0000-0000-7000-8000-000000000011'), parse_status: 'failed' },
      { ...makeQueueItem('019f0000-0000-7000-8000-000000000012'), parse_status: 'unparsed' },
    ])
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(page)

    render(<CopyrightEmailReview data={page} />)

    expect(screen.getAllByText(/^Received/)).toHaveLength(3)
    expect(screen.getAllByText('Parse failed')).toHaveLength(1)
    expect(screen.getAllByText('No parse recorded')).toHaveLength(1)
  })
})
