import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { getMembershipRefunds } from '@services/memberships/refunds'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/memberships/refunds validation', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  async function postRefundWithNote(note: unknown) {
    const request = createRequest()
    await request.authenticateAs(admin)
    return request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: 'user_test',
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
        note,
      })
      .expect(400)
  }

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()
    await request.post('/api/v1/memberships/refunds').send({}).expect(401)
  })

  it('returns 403 for non-admin non-CS users', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.post('/api/v1/memberships/refunds').send({}).expect(403)
  })

  it('returns 400 when user_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({ charge_id: 'ch_test', invoice_id: 'in_test', reason: 'goodwill' })
      .expect(400)
  })

  it('returns 400 when charge_id and payment_intent_id are both missing', async () => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({ user_id: target.id, invoice_id: 'in_test', reason: 'goodwill' })
      .expect(400)
  })

  it('returns 400 when invoice_id is missing', async () => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({ user_id: target.id, charge_id: 'ch_test', reason: 'goodwill' })
      .expect(400)
  })

  it('returns 400 for invalid reason', async () => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({ user_id: target.id, charge_id: 'ch_test', invoice_id: 'in_test', reason: 'bad' })
      .expect(400)
  })

  it('returns 400 for an invalid negative amount', async () => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
        amount: { amount: -100, currency: 'usd' },
      })
      .expect(400)
  })

  it('returns 400 for a non-integer amount', async () => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
        amount: { amount: 10.5, currency: 'usd' },
      })
      .expect(400)
  })

  it('returns 400 for an unsupported amount currency', async () => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
        amount: { amount: 100, currency: 'bhd' },
      })
      .expect(400)
  })

  it('rejects scaled money without creating a refund receipt', async () => {
    const target = await createTestUser()
    expect(await getMembershipRefunds(target.id)).toEqual([])
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
        amount: { amount: 500_000, currency: 'usd', scale: 6 },
      })
      .expect(400)

    expect(response.body.message).toBe('Invalid amount')
    expect(response.body).not.toHaveProperty('refund')
    expect(await getMembershipRefunds(target.id)).toEqual([])
  })

  it.each([
    { label: 'missing', idempotencyKey: undefined },
    { label: 'null', idempotencyKey: null },
    { label: 'non-string', idempotencyKey: 42 },
    { label: 'malformed', idempotencyKey: 'not-a-uuid' },
  ])('returns 400 when idempotency_key is $label', async ({ idempotencyKey }) => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'goodwill',
        ...(idempotencyKey !== undefined && { idempotency_key: idempotencyKey }),
      })
      .expect(400)
  })

  it('returns 400 when note is not a string', async () => {
    const response = await postRefundWithNote(42)
    expect(response.body.message).toBe('note must be a string')
  })

  it('returns 400 when note exceeds 1000 characters', async () => {
    const response = await postRefundWithNote('x'.repeat(1001))
    expect(response.body.message).toBe('note must be 1000 characters or fewer')
  })
})
