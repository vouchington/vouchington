import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { getMembershipRefunds } from '@services/memberships/refunds/read'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/memberships/refunds validation', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let target: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    target = await createTestUser()
  })

  async function postRefundWithNote(note: unknown, status: number) {
    const request = createRequest()
    await request.authenticateAs(admin)
    return request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
        note,
      })
      .expect(status)
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

  it('returns 422 when user_id is missing or not a UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const base = {
      charge_id: 'ch_test',
      invoice_id: 'in_test',
      reason: 'goodwill',
      idempotency_key: randomUUID(),
    }
    await request.post('/api/v1/memberships/refunds').send(base).expect(422)
    await request
      .post('/api/v1/memberships/refunds')
      .send({ ...base, user_id: 'user_test' })
      .expect(422)
  })

  it('returns 400 when charge_id and payment_intent_id are both missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        invoice_id: 'in_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
      })
      .expect(400)
  })

  it('returns 422 when invoice_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: 'ch_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
      })
      .expect(422)
  })

  it('returns 422 for invalid reason', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'bad',
        idempotency_key: randomUUID(),
      })
      .expect(422)
  })

  it.each([
    { amount: -100, status: 422 },
    { amount: 0, status: 400 },
  ])('returns $status for a refund amount of $amount', async ({ amount, status }) => {
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
        amount: { amount, currency: 'usd' },
      })
      .expect(status)
  })

  it('returns 422 for a non-integer amount', async () => {
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
      .expect(422)
  })

  it('returns 422 for an unsupported amount currency', async () => {
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
      .expect(422)
  })

  it('rejects scaled money without creating a refund receipt', async () => {
    const receiptTarget = await createTestUser()
    expect(await getMembershipRefunds(receiptTarget.id)).toEqual([])
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: receiptTarget.id,
        charge_id: 'ch_test',
        invoice_id: 'in_test',
        reason: 'goodwill',
        idempotency_key: randomUUID(),
        amount: { amount: 500_000, currency: 'usd', scale: 6 },
      })
      .expect(422)

    expect(response.body).not.toHaveProperty('refund')
    expect(await getMembershipRefunds(receiptTarget.id)).toEqual([])
  })

  it.each([
    { label: 'missing', idempotencyKey: undefined },
    { label: 'null', idempotencyKey: null },
    { label: 'non-string', idempotencyKey: 42 },
    { label: 'malformed', idempotencyKey: 'not-a-uuid' },
  ])('returns 422 when idempotency_key is $label', async ({ idempotencyKey }) => {
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
      .expect(422)
  })

  it('returns 422 when note is not a string', async () => {
    const response = await postRefundWithNote(42, 422)
    expect(response.status).toBe(422)
  })

  it.each(['', ' \t '])('returns 400 when note is blank after trimming', async note => {
    const response = await postRefundWithNote(note, 400)
    expect(response.body.message).toBe('note must not be blank')
  })

  it('returns 400 when note exceeds 1000 characters', async () => {
    const response = await postRefundWithNote('x'.repeat(1001), 400)
    expect(response.body.message).toBe('note must be 1000 characters or fewer')
  })
})
