import { expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'

export async function expectSessionPagination(cookies: string[]): Promise<void> {
  const first = await createRequest()
    .get('/api/v1/auth/sessions?limit=1')
    .set('Cookie', cookies)
    .expect(200)
  expect(first.body.page_info.has_next_page).toBe(true)
  const cursor = encodeURIComponent(first.body.page_info.end_cursor as string)
  const second = await createRequest()
    .get(`/api/v1/auth/sessions?limit=1&after=${cursor}`)
    .set('Cookie', cookies)
    .expect(200)
  expect(second.body.results[0].id).not.toBe(first.body.results[0].id)
}
