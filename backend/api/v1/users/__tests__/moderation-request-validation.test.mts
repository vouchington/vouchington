import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { gatherVoteWeightFactors } from '@services/vote-weight/gather-factors'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'

type Method = 'post' | 'put' | 'delete'

const ID = randomUUID()

// Anonymous callers get 401 with no schema diagnostic, callers without the role get 403, and only
// a permitted caller sees the 422.
const MALFORMED: Array<[string, Method, string, unknown]> = [
  ['suspension reason type', 'put', `/api/v1/users/${ID}/suspension`, { reason: 5 }],
  ['suspension unknown key', 'put', `/api/v1/users/${ID}/suspension`, { note: 'x' }],
  ['vote weight missing', 'put', `/api/v1/users/${ID}/vote-weight`, {}],
  ['vote weight type', 'put', `/api/v1/users/${ID}/vote-weight`, { weight: 'abc' }],
  ['vote weight unknown key', 'put', `/api/v1/users/${ID}/vote-weight`, { weight: 1, x: 1 }],
  ['mod note missing body', 'post', `/api/v1/users/${ID}/mod-notes`, {}],
  ['mod note body type', 'post', `/api/v1/users/${ID}/mod-notes`, { body: 5 }],
  ['mod note unknown key', 'post', `/api/v1/users/${ID}/mod-notes`, { body: 'x', extra: 1 }],
]

describe('user moderation route request contracts', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let target: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser, target] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])
  })

  it.each(MALFORMED)(
    '%s: 401 without a diagnostic for anonymous',
    async (_l, method, url, body) => {
      const request = createRequest()
      const response = await request[method](url).send(body as object)

      expect(response.status).toBe(401)
      expect(response.text).not.toMatch(/schema|must be|required|invalid/i)
    },
  )

  it.each(MALFORMED)('%s: 403 for a caller without the role', async (_l, method, url, body) => {
    const request = createRequest()
    await request.authenticateAs(regularUser)

    await request[method](url)
      .send(body as object)
      .expect(403)
  })

  it.each(MALFORMED)('%s: 422 for staff', async (_l, method, url, body) => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const path = url.replace(ID, target.id)

    await request[method](path)
      .send(body as object)
      .expect(422)
  })

  it('does not suspend a user for a malformed body', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.put(`/api/v1/users/${target.id}/suspension`).send({ reason: 5 }).expect(422)
    expect((await getPrivateUserByAny(target.id))?.suspended_at).toBeNull()

    const response = await request
      .put(`/api/v1/users/${target.id}/suspension`)
      .send({ reason: 'spam' })
      .expect(200)
    expect(response.body.user.suspended_reason).toBe('spam')
    await request.delete(`/api/v1/users/${target.id}/suspension`).expect(200)
  })

  it('does not change the vote weight for a malformed body and keeps the range at 400', async () => {
    const subject = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    const url = `/api/v1/users/${subject.id}/vote-weight`

    await request.put(url).send({ weight: 'abc' }).expect(422)
    await request.put(url).send({ weight: -1 }).expect(400)
    await request.put(url).send({ weight: 1_000_001 }).expect(400)
    expect((await gatherVoteWeightFactors(subject.id))?.vote_weight_admin_set_at).toBeNull()

    await request.put(url).send({ weight: 2.5 }).expect(204)
    expect((await gatherVoteWeightFactors(subject.id))?.current_weight).toBe(2.5)
  })

  it('answers 422 rather than a database error for a non-UUID vote weight target', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.put('/api/v1/users/not-a-uuid/vote-weight').send({ weight: 1 }).expect(422)
    await request.delete('/api/v1/users/not-a-uuid/vote-weight').expect(422)
  })

  it('creates no mod note for a malformed body and keeps the semantic 422s', async () => {
    const subject = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    const url = `/api/v1/users/${subject.id}/mod-notes`

    await request.post(url).send({ body: 5 }).expect(422)
    await request.post(url).send({ body: '   ' }).expect(422)
    await request.post(url).send({ body: 'x', community_id: 'nope' }).expect(422)
    expect((await request.get(url).expect(200)).body.notes).toEqual([])

    await request.post(url).send({ body: 'Watch this account' }).expect(201)
    expect((await request.get(url).expect(200)).body.notes).toHaveLength(1)
  })

  it('keeps the lenient limit and cursor handling on the mod-note list', async () => {
    const subject = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    const url = `/api/v1/users/${subject.id}/mod-notes`
    await request.post(url).send({ body: 'one' }).expect(201)
    await request.post(url).send({ body: 'two' }).expect(201)

    expect((await request.get(`${url}?limit=500`).expect(200)).body.notes).toHaveLength(2)
    expect((await request.get(`${url}?limit=abc`).expect(200)).body.notes).toHaveLength(2)
    expect((await request.get(`${url}?limit=0`).expect(200)).body.notes).toHaveLength(1)
    expect((await request.get(`${url}?limit=&after=`).expect(200)).body.notes).toHaveLength(2)
    await request.get(`${url}?after=not-a-uuid`).expect(422)
    await request.get(`${url}?after=${ID}&after=${ID}`).expect(422)
    await request.get(`${url}?cursor=${ID}`).expect(400)
  })

  it('answers 401 and 403 for the mod-note list and context without a schema diagnostic', async () => {
    const anonymous = await createRequest().get(`/api/v1/users/${ID}/mod-notes?after=nope`)
    expect(anonymous.status).toBe(401)
    expect(anonymous.text).not.toMatch(/schema|must be|required|invalid/i)

    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get(`/api/v1/users/${ID}/mod-notes?after=nope`).expect(403)
    await request.get(`/api/v1/users/${ID}/moderation-context`).expect(403)
  })

  it('keeps the UUID path checks on the note, context, and suspension routes', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.get('/api/v1/users/not-a-uuid/moderation-context').expect(422)
    await request.delete(`/api/v1/users/${target.id}/mod-notes/not-a-uuid`).expect(422)
    await request.delete(`/api/v1/users/${ID}/suspension`).expect(404)
  })
})
