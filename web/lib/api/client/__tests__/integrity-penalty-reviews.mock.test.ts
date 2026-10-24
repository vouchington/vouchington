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
    const response = { results: [{ id: 'report-penalty-1' }], has_more: false }
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => getReportAbusePenaltyReviewsDue<typeof response>(),
      expectedArgs: ['/api/v1/report-integrity/penalties/review-due'],
    })
  })

  it('loads the vote weight review queue from the staff endpoint', async () => {
    const response = { results: [{ id: 'vote-penalty-1' }], has_more: false }
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => getVoteWeightPenaltyReviewsDue<typeof response>(),
      expectedArgs: ['/api/v1/vote-integrity/penalties/review-due'],
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
