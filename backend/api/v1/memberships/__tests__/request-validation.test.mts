import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type Method = 'get' | 'post' | 'delete'
type Case = [label: string, method: Method, url: string, body: unknown]

const ID = randomUUID()
const REFUND = { user_id: ID, invoice_id: 'in_1', reason: 'goodwill' }

// Administrator routes: authentication, then the role gate (403), then the request contract (422).
const ADMIN: Case[] = [
  [
    'grant with an unknown plan',
    'post',
    '/api/v1/membership-grants',
    { user_id: ID, plan: 'gold' },
  ],
  ['grant revocation without a reason', 'delete', `/api/v1/membership-grants/${ID}`, {}],
  ['refund without an invoice', 'post', '/api/v1/memberships/refunds', { user_id: ID }],
  [
    'refund with negative money',
    'post',
    '/api/v1/memberships/refunds',
    { ...REFUND, idempotency_key: ID, amount: { amount: -1, currency: 'usd' } },
  ],
  [
    'refund with fractional money',
    'post',
    '/api/v1/memberships/refunds',
    { ...REFUND, idempotency_key: ID, amount: { amount: 1.5, currency: 'usd' } },
  ],
  [
    'refund with an unsupported currency',
    'post',
    '/api/v1/memberships/refunds',
    { ...REFUND, idempotency_key: ID, amount: { amount: 100, currency: 'xyz' } },
  ],
  [
    'refundable charges for a bad user id',
    'get',
    '/api/v1/memberships/refundable-charges?user_id=x',
    null,
  ],
]

// Member routes: authentication, then the request contract (422).
const MEMBER: Case[] = [
  ['purchase intent with a bad provider', 'post', '/api/v1/membership-purchase-intents', {}],
  [
    'purchase intent with a bad product id',
    'post',
    '/api/v1/membership-purchase-intents',
    { provider: 'stripe', product_id: 'x', idempotency_key: ID },
  ],
  [
    'verification without evidence',
    'post',
    '/api/v1/membership-verifications',
    { provider: 'apple' },
  ],
  [
    'portal session without a return url',
    'post',
    '/api/v1/memberships/billing-portal-sessions',
    {},
  ],
]

describe('membership route request contract ordering', () => {
  let admin: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    ;[admin, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  function send(request: ReturnType<typeof createRequest>, [, method, url, body]: Case) {
    const pending = request[method](url)
    return body === null ? pending : pending.send(body as object)
  }

  it.each([...ADMIN, ...MEMBER])(
    '%s: 401 with no schema diagnostic when anonymous',
    async (...c) => {
      const response = await send(createRequest(), c)

      expect(response.status).toBe(401)
      expect(response.text).not.toMatch(/schema|must be|required|invalid/i)
    },
  )

  it.each(ADMIN)('%s: 403 for a member, 422 for an administrator', async (...c) => {
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    await send(memberRequest, c).expect(403)

    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)
    await send(adminRequest, c).expect(422)
  })

  it.each(MEMBER)('%s: 422 for a signed-in member', async (...c) => {
    const request = createRequest()
    await request.authenticateAs(member)

    await send(request, c).expect(422)
  })

  it('keeps semantic refund and grant checks at 400 after the contract passes', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const refund = await send(request, [
      '',
      'post',
      '/api/v1/memberships/refunds',
      { ...REFUND, idempotency_key: ID },
    ]).expect(400)
    expect(refund.body.message).toBe('Must provide charge_id or payment_intent_id')

    await send(request, [
      '',
      'post',
      '/api/v1/membership-grants',
      { user_id: ID, plan: 'plus', sku_id: ID, duration_days: 0 },
    ]).expect(400)
  })
})
