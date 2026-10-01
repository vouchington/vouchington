import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const UUID = '00000000-0000-7000-8000-000000000001'

type Method = 'post' | 'patch' | 'put' | 'delete'
type Case = readonly [label: string, method: Method, path: string, body: unknown]

// Account, profile and preference mutations. Every body here violates the generated request
// schema (wrong type, unknown field, missing required field, or a non-object).
const malformed: readonly Case[] = [
  ['identity with a wrong-typed username', 'patch', '/api/v1/my/identity', { username: 7 }],
  ['identity with an unknown field', 'patch', '/api/v1/my/identity', { role: 'admin' }],
  ['identity with a non-UUID image', 'patch', '/api/v1/my/identity', { profile_image_id: 'x' }],
  ['identity with a null body', 'patch', '/api/v1/my/identity', null],
  ['profile without markdown', 'patch', '/api/v1/my/profile', {}],
  ['profile with wrong-typed markdown', 'patch', '/api/v1/my/profile', { markdown: 7 }],
  ['profile link with an unknown type', 'post', '/api/v1/my/profile/links', { link_type: 'x' }],
  [
    'profile link update with a non-UUID image',
    'patch',
    `/api/v1/my/profile/links/${UUID}`,
    {
      image_id: 'x',
    },
  ],
  [
    'profile link order with duplicate ids',
    'put',
    '/api/v1/my/profile/links/order',
    {
      ids: [UUID, UUID],
    },
  ],
  ['profile link order with an empty list', 'put', '/api/v1/my/profile/links/order', { ids: [] }],
  ['email address without an address', 'post', '/api/v1/my/email-addresses', {}],
  [
    'email address with a numeric address',
    'post',
    '/api/v1/my/email-addresses',
    {
      email_address: 7,
    },
  ],
  [
    'primary email with a string flag',
    'patch',
    '/api/v1/my/email-addresses/a@voucha.ai',
    {
      is_primary: 'yes',
    },
  ],
  [
    'email verification without a token',
    'post',
    '/api/v1/my/email-addresses/a@voucha.ai/verifications',
    {},
  ],
  [
    'email preferences with an unknown field',
    'patch',
    '/api/v1/my/email-preferences',
    {
      unsubscribe_all: true,
    },
  ],
  [
    'financial profile with a wrong-typed count',
    'put',
    '/api/v1/my/financial-profile',
    {
      cards_opened_24m: 'many',
    },
  ],
  [
    'consent with an unknown type',
    'post',
    '/api/v1/my/consents',
    { consent_type: 'x', version: '1' },
  ],
  ['consent without a version', 'post', '/api/v1/my/consents', { consent_type: 'terms' }],
  ['aside preference without a key', 'post', '/api/v1/my/aside-preferences', {}],
  [
    'display preferences with a string flag',
    'patch',
    '/api/v1/my/identity-verification/display-preferences',
    {
      verified_badge_visible: 'yes',
    },
  ],
]

// Plan #285: malformed input from an anonymous caller is a 401 with no diagnostic, and from an
// authenticated caller a 422 that fires after the identity and suspension checks.
describe('account request contract validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it.each(malformed)(
    'returns 401 without a diagnostic for anonymous %s',
    async (_l, method, path, body) => {
      const anonymous = createRequest()
      const response = await anonymous[method](path)
        .send(body as object)
        .expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    },
  )

  it.each(malformed)('returns 422 for %s', async (_label, method, path, body) => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request[method](path)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body))
      .expect(422)
    expect(response.text).toMatch(/invalid/i)
  })

  it('returns 403 for a suspended user before validating the body', async () => {
    const suspended = await createTestUser()
    await suspendTestUser(suspended.id)
    try {
      const request = createRequest()
      await request.authenticateAs(suspended)
      await request.patch('/api/v1/my/identity').send({ username: 7 }).expect(403)
      await request.post('/api/v1/my/email-addresses').send({}).expect(403)
    } finally {
      await unsuspendTestUser(suspended.id)
    }
  })

  it('does not change the identity when the body is rejected', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch('/api/v1/my/identity')
      .send({ username: `${user.username}-x`, role: 'admin' })
      .expect(422)
    const response = await request.get('/api/v1/my/identity').expect(200)
    expect(response.body.identity.username).toBe(user.username)
  })

  it('still accepts a valid body', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.patch('/api/v1/my/profile').send({ markdown: 'hello' }).expect(200)
    await request
      .post('/api/v1/my/aside-preferences')
      .send({ aside_key: 'contract-test' })
      .expect(204)
  })
})
