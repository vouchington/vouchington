import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

function liftUrl(noticeId: string, restrictionId: string) {
  return `/api/v1/copyright-notices/${noticeId}/restrictions/${restrictionId}/lifts`
}

async function administratorRequest() {
  const request = createRequest()
  await request.authenticateAs(await createTestUser({ administrator: true }))
  return request
}

describe('copyright restriction administrator lift request', () => {
  it('keeps authentication and authorization ahead of malformed input', async () => {
    const url = liftUrl(crypto.randomUUID(), crypto.randomUUID())
    await createRequest().post(url).send({ injected: true }).expect(401)
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    await member.post(url).send({ injected: true }).expect(403)
    const moderator = createRequest()
    await moderator.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    await moderator.post(url).send({ injected: true }).expect(403)
  })

  it('rejects content type, malformed paths and non-object bodies before service lookup', async () => {
    const staff = await administratorRequest()
    const noticeId = crypto.randomUUID()
    const restrictionId = crypto.randomUUID()
    const url = liftUrl(noticeId, restrictionId)
    await staff.post(url).set('Content-Type', 'text/plain').send('hello').expect(415)
    await staff
      .post(liftUrl('not-a-uuid', restrictionId))
      .send({ rationale: 'Correct error.' })
      .expect(422)
    await staff
      .post(liftUrl(noticeId, 'not-a-uuid'))
      .send({ rationale: 'Correct error.' })
      .expect(422)
    for (const raw of ['null', '[]', '5']) {
      const response = await staff
        .post(url)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    }
    await staff.post(url).send({ rationale: 'Correct error.' }).expect(404)
  })

  it.each([
    ['missing', {}],
    ['empty', { rationale: '' }],
    ['whitespace', { rationale: '   ' }],
    ['overlong', { rationale: 'a'.repeat(10_001) }],
    ['non-string', { rationale: 3 }],
  ])('returns a field-named 422 for %s rationale', async (_label, body) => {
    const staff = await administratorRequest()
    const response = await staff
      .post(liftUrl(crypto.randomUUID(), crypto.randomUUID()))
      .send(body)
      .expect(422)
    expect(response.body.message).toBe('rationale is required')
  })

  it('rejects an unknown key from the closed request contract', async () => {
    const staff = await administratorRequest()
    const url = liftUrl(crypto.randomUUID(), crypto.randomUUID())
    const rejected = await staff
      .post(url)
      .send({ rationale: 'Correct error.', unexpected: true })
      .expect(422)
    expect(rejected.body.message).toBe('Invalid request body')
    await staff.post(url).send({ rationale: 'Correct error.' }).expect(404)
  })
})
