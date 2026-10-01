import { beforeAll, describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const subscription = (overrides: Record<string, unknown> = {}) => ({
  endpoint: `https://push.example/${Math.random().toString(36).slice(2, 12)}`,
  p256dh: 'p256dh-key-0123456789',
  auth: 'auth-secret',
  ...overrides,
})

// The generated schema fixes each field's type; length, scheme and integer bounds stay semantic
// checks with their own statuses.
describe('web push subscription semantic checks', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it.each([
    ['an unparseable endpoint', { endpoint: 'not a url' }, 400],
    ['a plain http endpoint', { endpoint: 'http://push.example/x' }, 400],
    ['a short p256dh key', { p256dh: 'short' }, 400],
    ['a short auth secret', { auth: 'short' }, 400],
    ['a negative expiration', { expiration_time_ms: -1 }, 422],
    ['a fractional expiration', { expiration_time_ms: 1.5 }, 422],
  ])('rejects %s', async (_label, overrides, status) => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/notifications/push-subscriptions')
      .send(subscription(overrides))
      .expect(status)
  })

  it.each([
    ['a whole-number expiration', 1_900_000_000_000],
    ['a null expiration', null],
  ])('accepts %s', async (_label, expiration_time_ms) => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/notifications/push-subscriptions')
      .send(subscription({ expiration_time_ms }))
      .expect(201)
  })
})
