import { expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'

export async function expectApiKeyPagination(user: PrivateUser): Promise<void> {
  await createApiKey(user.id, 'rss', 'Page one', ['rss:read'])
  await createApiKey(user.id, 'rss', 'Page two', ['rss:read'])
  const request = createRequest()
  await request.authenticateAs(user)
  const first = await request.get('/api/v1/my/api-keys?limit=1').expect(200)
  expect(first.body.page_info.has_next_page).toBe(true)
  const cursor = encodeURIComponent(first.body.page_info.end_cursor as string)
  const second = await request.get(`/api/v1/my/api-keys?limit=1&after=${cursor}`).expect(200)
  expect(second.body.results[0].id).not.toBe(first.body.results[0].id)

  const otherUser = await createTestUser()
  const otherRequest = createRequest()
  await otherRequest.authenticateAs(otherUser)
  await otherRequest.get(`/api/v1/my/api-keys?after=${cursor}`).expect(400)
}
