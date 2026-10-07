import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestCard } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const UUID = '00000000-0000-7000-8000-000000000001'
const usd = (amount: number) => ({ amount, currency: 'usd' })

type Method = 'post' | 'patch'
type Case = readonly [label: string, method: Method, path: string, body: unknown]

// Cards, point valuations, program statuses and spending categories. Money is a strict object
// (integer minor units, a known currency); the schema also fixes unknown fields and null bodies.
const malformed: readonly Case[] = [
  ['card without an id', 'post', '/api/v1/my/cards', {}],
  ['card with a numeric id', 'post', '/api/v1/my/cards', { card_topic_id: 7 }],
  ['card with an unknown field', 'post', '/api/v1/my/cards', { card_topic_id: UUID, owner: UUID }],
  [
    'card update with negative money',
    'patch',
    `/api/v1/my/cards/${UUID}`,
    {
      credit_limit: usd(-1),
    },
  ],
  [
    'card update with non-object money',
    'patch',
    `/api/v1/my/cards/${UUID}`,
    {
      credit_limit: 'lots',
    },
  ],
  [
    'card update with a string flag',
    'patch',
    `/api/v1/my/cards/${UUID}`,
    {
      is_authorized_user: 'yes',
    },
  ],
  ['card update with a null body', 'patch', `/api/v1/my/cards/${UUID}`, null],
  [
    'valuation without a value',
    'post',
    '/api/v1/my/rewards-program-point-valuations',
    {
      rewards_program_id: UUID,
    },
  ],
  [
    'valuation with the wrong scale',
    'post',
    '/api/v1/my/rewards-program-point-valuations',
    {
      rewards_program_id: UUID,
      value_per_point: { ...usd(1), scale: 5 },
    },
  ],
  [
    'valuation update with a numeric note',
    'patch',
    `/api/v1/my/rewards-program-point-valuations/${UUID}`,
    {
      note: 7,
    },
  ],
  ['status without an id', 'post', '/api/v1/my/rewards-program-statuses', {}],
  [
    'status update with a numeric date',
    'patch',
    `/api/v1/my/rewards-program-statuses/${UUID}`,
    {
      since: 7,
    },
  ],
  [
    'spending category without an amount',
    'post',
    '/api/v1/my/spending-categories',
    {
      spending_category_topic_id: UUID,
    },
  ],
  [
    'spending category with fractional money',
    'post',
    '/api/v1/my/spending-categories',
    {
      spending_category_topic_id: UUID,
      amount: usd(1.5),
    },
  ],
  [
    'spending category with an unknown frequency',
    'post',
    '/api/v1/my/spending-categories',
    {
      spending_category_topic_id: UUID,
      amount: usd(100),
      spending_frequency: 'weekly',
    },
  ],
  [
    'spending category update with string money',
    'patch',
    `/api/v1/my/spending-categories/${UUID}`,
    {
      amount: '100',
    },
  ],
]

// Plan #285: malformed input from an anonymous caller is a 401 with no diagnostic, and from an
// authenticated caller a 422 that fires before any service call.
describe('money and rewards request contract validation', () => {
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
    expect(response.text).toMatch(/invalid|valid money/i)
  })

  it('creates nothing when a spending category is rejected', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/spending-categories')
      .send({ spending_category_topic_id: UUID, amount: usd(1.5) })
      .expect(422)
    const response = await request.get('/api/v1/my/spending-categories').expect(200)
    expect(response.body.results).toEqual([])
  })

  it('accepts valid money on a card update', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const created = await request
      .post('/api/v1/my/cards')
      .send({ card_topic_id: await insertTestCard({ createdById: user.id }) })
      .expect(201)
    const updated = await request
      .patch(`/api/v1/my/cards/${created.body.card.id}`)
      .send({ credit_limit: usd(500_000) })
      .expect(200)
    expect(updated.body.card.credit_limit).toEqual(usd(500_000))
  })
})
