import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, updateTestUserUiLocale } from '@voucha/test-helpers'

const newAddress = () => `tests+test-${Math.random().toString(36).slice(2, 10)}@voucha.ai`

describe('email address list and verification request', () => {
  it('returns an empty page with null cursors after the last address', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const first = await request.get('/api/v1/my/email-addresses?limit=1').expect(200)
    expect(first.body.results).toHaveLength(1)
    const cursor = first.body.page_info.start_cursor as string

    const next = await request
      .get('/api/v1/my/email-addresses')
      .query({ after: cursor })
      .expect(200)
    expect(next.body.results).toEqual([])
    expect(next.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('requests verification for a user without a UI locale', async () => {
    const user = await createTestUser()
    await updateTestUserUiLocale(user.id, null)
    const address = newAddress()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({ email_address: address })
      .expect(200)
    expect(response.body.email_address).toBe(address)
  })
})
