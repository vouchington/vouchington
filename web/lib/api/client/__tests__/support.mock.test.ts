import { afterEach, describe, it, vi } from 'vitest'
import { clientApi } from '../instance'
import { getAdminSupportContactClient } from '../support'
import type { SupportContactDetailResponse } from '@/types/support'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

function makeSupportContactDetailResponse(): SupportContactDetailResponse {
  return {
    contact: {
      id: 'contact-1',
      email_address: 'tests+support-contact@voucha.ai',
      name: 'Support Contact',
      user_id: null,
      notes: '',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    threads: [],
    thread_page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

const mockGet = vi.mocked(clientApi.get)

describe('support client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads a support contact detail page with cursor pagination', async () => {
    const response = makeSupportContactDetailResponse()

    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => getAdminSupportContactClient('contact-1', { after: 'cursor-2', limit: 50 }),
      expectedArgs: [
        '/api/v1/support/contacts/contact-1',
        { searchParams: { after: 'cursor-2', limit: 50 } },
      ],
    })
  })
})
