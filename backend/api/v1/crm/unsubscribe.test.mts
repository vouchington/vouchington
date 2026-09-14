import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestCrmContact, createUniqueTestEmail } from '@voucha/test-helpers'
import { createCrmUnsubscribeToken, getCrmContact } from '@services/crm-contacts'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/crm/unsubscribe', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('opts the contact out and returns ok for a valid token', async () => {
    const email = createUniqueTestEmail('crm-unsubscribe-route')
    const contact = await createTestCrmContact(admin, { email })
    const token = createCrmUnsubscribeToken(email)

    const request = createRequest()
    const response = await request.post('/api/v1/crm/unsubscribe').send({ token }).expect(200)

    expect(response.body).toEqual({ ok: true })
    const updated = await getCrmContact(contact.id)
    expect(updated!.opted_out_at).not.toBeNull()
  })

  it('accepts the token as a query param', async () => {
    const email = createUniqueTestEmail('crm-unsubscribe-route-query')
    const contact = await createTestCrmContact(admin, { email })
    const token = createCrmUnsubscribeToken(email)

    const request = createRequest()
    await request.post(`/api/v1/crm/unsubscribe?token=${encodeURIComponent(token)}`).expect(200)

    const updated = await getCrmContact(contact.id)
    expect(updated!.opted_out_at).not.toBeNull()
  })

  it('accepts RFC 8058 form-urlencoded unsubscribes with a charset parameter and query token', async () => {
    const email = createUniqueTestEmail('crm-unsubscribe-route-form')
    const contact = await createTestCrmContact(admin, { email })
    const token = createCrmUnsubscribeToken(email)

    await createRequest()
      .post(`/api/v1/crm/unsubscribe?token=${encodeURIComponent(token)}`)
      .set('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8')
      .send('List-Unsubscribe=One-Click')
      .expect(200)

    await expect(getCrmContact(contact.id)).resolves.toMatchObject({
      opted_out_at: expect.any(Date),
    })
  })

  it('returns 400 for a missing token', async () => {
    const request = createRequest()
    await request.post('/api/v1/crm/unsubscribe').send({}).expect(400)
  })

  it('returns 400 for a garbage token', async () => {
    const request = createRequest()
    await request.post('/api/v1/crm/unsubscribe').send({ token: 'not-a-real-token' }).expect(400)
  })

  it('does not require authentication', async () => {
    const token = createCrmUnsubscribeToken(createUniqueTestEmail('crm-unsubscribe-route-anon'))
    const request = createRequest()
    await request.post('/api/v1/crm/unsubscribe').send({ token }).expect(200)
  })
})
