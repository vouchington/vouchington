import { afterEach, describe, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { reviewReportAbusePenalty } from '../report-integrity'
import { reviewVoteWeightPenalty } from '../vote-integrity'

const mockPost = vi.mocked(clientApi.post)

describe('integrity penalty review client helpers', () => {
  afterEach(() => vi.clearAllMocks())

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
