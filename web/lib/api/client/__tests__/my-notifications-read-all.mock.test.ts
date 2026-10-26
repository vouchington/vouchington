import { afterEach, describe, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { markAllMyNotificationsRead } from '../my-notifications'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { MarkAllNotificationsReadResponseBody } from '@/types/api-responses'

const mockPost = vi.mocked(clientApi.post)

describe('markAllMyNotificationsRead', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the immediate page count and continuation state from read-all', async () => {
    const response: MarkAllNotificationsReadResponseBody = {
      success: true,
      marked_read: 2,
      has_more: true,
    }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: markAllMyNotificationsRead,
      expectedArgs: ['/api/v1/my/notifications/read-all', {}],
    })
  })
})
