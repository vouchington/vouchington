import { describe, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import { makeLandingPageCandidatesResponse } from '@/test-helpers/api-responses/landing-pages'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { get: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { getMyLandingPageCandidatesClient } from '../my'

describe('landing page candidates client', () => {
  it('passes the continuation cursor to the candidates endpoint', async () => {
    const response = makeLandingPageCandidatesResponse()
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.get),
      response,
      call: () => getMyLandingPageCandidatesClient('cursor'),
      expectedArgs: ['/api/v1/my/landing-pages/candidates', { searchParams: { after: 'cursor' } }],
    })
  })
})
