import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const NOTICES = '/api/v1/copyright-notices'
const UNKNOWN_BODIES = [{}, { injected: true }]

function similarityUrl(noticeId: string, targetId: string) {
  return `${NOTICES}/${noticeId}/targets/${targetId}/image-similarity-candidates`
}

async function createStaff() {
  const staff = createRequest()
  await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return staff
}

describe('copyright staff path and query request contracts', () => {
  useCopyrightIntakeEnvironment()

  describe('authentication and path', () => {
    it('keeps a bare 401 and 403 ahead of any schema diagnostic', async () => {
      const [noticeId, otherId] = [crypto.randomUUID(), crypto.randomUUID()]
      const member = createRequest()
      await member.authenticateAs(await createTestUser())
      const posts = [
        `${NOTICES}/${noticeId}/delivery-intents/${otherId}/replays`,
        `${NOTICES}/${noticeId}/action-intents/${otherId}/replays`,
        `${NOTICES}/${noticeId}/staydown-matches/${otherId}/reviews`,
      ]

      for (const url of posts) {
        const anonymous = await createRequest().post(url).send({ injected: true }).expect(401)
        expect(anonymous.text).not.toMatch(/schema|must be|required|invalid/i)
        await member.post(url).send({ injected: true }).expect(403)
      }
      const similarity = `${similarityUrl(noticeId, otherId)}?limit=abc`
      await createRequest().get(similarity).expect(401)
      await member.get(similarity).expect(403)
    })

    it('rejects a malformed path id on every route', async () => {
      const staff = await createStaff()
      const id = crypto.randomUUID()
      for (const kind of ['delivery-intents', 'action-intents', 'staydown-matches']) {
        const action = kind === 'staydown-matches' ? 'reviews' : 'replays'
        await staff.post(`${NOTICES}/not-a-uuid/${kind}/${id}/${action}`).send({}).expect(422)
        await staff.post(`${NOTICES}/${id}/${kind}/not-a-uuid/${action}`).send({}).expect(422)
      }
      await staff.get(similarityUrl('not-a-uuid', id)).expect(422)
      await staff.get(similarityUrl(id, 'not-a-uuid')).expect(422)
    })
  })

  // These routes read no body, and the web client posts `{}`. The contract names only the path, so
  // a body is never a reason to refuse the request.
  describe('body-free POST routes', () => {
    it.each(UNKNOWN_BODIES)('replays an unknown delivery intent for the body %j', async body => {
      const staff = await createStaff()
      const response = await staff
        .post(`${NOTICES}/${crypto.randomUUID()}/delivery-intents/${crypto.randomUUID()}/replays`)
        .send(body)
        .expect(200)
      expect(response.body).toEqual({ replayed: false })
    })

    it.each(UNKNOWN_BODIES)('replays an unknown action intent for the body %j', async body => {
      const staff = await createStaff()
      const response = await staff
        .post(`${NOTICES}/${crypto.randomUUID()}/action-intents/${crypto.randomUUID()}/replays`)
        .send(body)
        .expect(200)
      expect(response.body).toEqual({ replayed: false })
    })

    it.each(UNKNOWN_BODIES)(
      'answers 404 for an unknown staydown match for the body %j',
      async body => {
        const staff = await createStaff()
        await staff
          .post(`${NOTICES}/${crypto.randomUUID()}/staydown-matches/${crypto.randomUUID()}/reviews`)
          .send(body)
          .expect(404)
      },
    )
  })

  // The limit is lenient: a malformed or out-of-range value is ignored and the default applies, so
  // the contract validates the value the parser settled on and never answers 422 for the raw string.
  // An unknown target is the service's 404, so a 422 here would mean the contract rejected it.
  describe('GET /copyright-notices/:id/targets/:targetId/image-similarity-candidates', () => {
    it.each(['', '?limit=5', '?limit=50', '?limit=0', '?limit=51', '?limit=abc', '?limit=2.5'])(
      'passes the query %j to the service instead of rejecting it',
      async query => {
        const staff = await createStaff()
        await staff
          .get(`${similarityUrl(crypto.randomUUID(), crypto.randomUUID())}${query}`)
          .expect(404)
      },
    )

    it('ignores an unknown query key', async () => {
      const staff = await createStaff()
      await staff
        .get(`${similarityUrl(crypto.randomUUID(), crypto.randomUUID())}?injected=1&limit=5`)
        .expect(404)
    })
  })
})
