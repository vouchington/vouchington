import { afterEach, describe, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { get: vi.fn<VitestLooseMock>(), post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { getReportAbusePenaltyReviewsDue, reviewReportAbusePenalty } from '../report-integrity'
import { getVoteWeightPenaltyReviewsDue, reviewVoteWeightPenalty } from '../vote-integrity'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('integrity penalty review client helpers', () => {
  afterEach(() => vi.clearAllMocks())

  it('loads the report abuse review queue from the staff endpoint', async () => {
    const response = {
      results: [{ id: 'report-penalty-1' }],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => getReportAbusePenaltyReviewsDue<typeof response>(),
      expectedArgs: [
        '/api/v1/report-integrity/penalties/review-due',
        { searchParams: { after: undefined, limit: undefined } },
      ],
    })
  })

  it('loads the vote weight review queue from the staff endpoint', async () => {
    const response = {
      results: [{ id: 'vote-penalty-1' }],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => getVoteWeightPenaltyReviewsDue<typeof response>(),
      expectedArgs: [
        '/api/v1/vote-integrity/penalties/review-due',
        { searchParams: { after: undefined, limit: undefined } },
      ],
    })
  })

  it('passes opaque continuation and bounded page size to both review queues', async () => {
    const response = {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    const options = { after: 'opaque-review-position', limit: 10 }
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => getReportAbusePenaltyReviewsDue<typeof response>(options),
      expectedArgs: [
        '/api/v1/report-integrity/penalties/review-due',
        { searchParams: { after: options.after, limit: '10' } },
      ],
    })
    mockGet.mockClear()
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => getVoteWeightPenaltyReviewsDue<typeof response>(options),
      expectedArgs: [
        '/api/v1/vote-integrity/penalties/review-due',
        { searchParams: { after: options.after, limit: '10' } },
      ],
    })
  })

  it('posts a report abuse penalty review to the staff endpoint', async () => {
    const response = { penalty: { id: 'report-penalty-1', review_due_at: '2027-10-23T00:00:00Z' } }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () => reviewReportAbusePenalty<typeof response>('report-penalty-1'),
      expectedArgs: ['/api/v1/report-integrity/penalties/report-penalty-1/reviews'],
    })
  })

  it('posts a vote weight penalty review to the staff endpoint', async () => {
    const response = { penalty: { id: 'vote-penalty-1', review_due_at: '2027-10-23T00:00:00Z' } }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () => reviewVoteWeightPenalty<typeof response>('vote-penalty-1'),
      expectedArgs: ['/api/v1/vote-integrity/penalties/vote-penalty-1/reviews'],
    })
  })
})
