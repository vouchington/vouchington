import { describe, it, vi, afterEach } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { recordCopyrightEmailIntakeLegalProcess } from '../copyright-email-intakes'

describe('copyright email intake legal process client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs only the reason to the intake legal-process route', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.post),
      response: { decision: 'legal_process' as const },
      call: () => recordCopyrightEmailIntakeLegalProcess('intake-1', 'Subpoena for records.'),
      expectedArgs: [
        '/api/v1/copyright-email-intakes/intake-1/legal-process',
        { reason: 'Subpoena for records.' },
      ],
    })
  })
})
