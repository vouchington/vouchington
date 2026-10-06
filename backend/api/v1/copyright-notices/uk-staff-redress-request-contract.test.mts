import { describe, expect, it } from 'vitest'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  approveJurisdictionPolicy,
  createTerritorialActors,
  seedDeterminedTerritorialNotice,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'

// A caller the handler turns away answers with a bare status, never a schema diagnostic.
const SCHEMA_DIAGNOSTIC = /schema|must be|required|invalid/i
const BASE = '/api/v1/copyright-uk-notices'
const body = { explanation: 'Complaint received by email' }

async function determinedUkNotice() {
  const actors = await createTerritorialActors()
  await approveJurisdictionPolicy(actors.administrator, 'uk')
  const noticeId = await seedDeterminedTerritorialNotice('uk', actors)
  return { ...actors, noticeId, url: `${BASE}/${noticeId}/redress-requests` }
}

// UK redress has no participant route: staff record a complaint received by another channel.
describe('UK staff-recorded redress requests', () => {
  useCopyrightIntakeEnvironment()

  it('turns away anonymous callers, the notifier and other members ahead of the schema check', async () => {
    const { anonymousRequest, claimantRequest, strangerRequest, url } = await determinedUkNotice()

    const anonymous = await anonymousRequest
      .post(url)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body)
      .expect(401)
    expect(anonymous.text).not.toMatch(SCHEMA_DIAGNOSTIC)
    for (const request of [claimantRequest, strangerRequest]) {
      for (const sent of [body, { ...body, injected: true }]) {
        const rejected = await request
          .post(url)
          .set('Idempotency-Key', crypto.randomUUID())
          .send(sent)
          .expect(403)
        expect(rejected.text).not.toMatch(SCHEMA_DIAGNOSTIC)
      }
    }
  })

  it('records the complaint for staff once and replays the same key', async () => {
    const { staffRequest, url } = await determinedUkNotice()
    const key = crypto.randomUUID()

    const created = await staffRequest.post(url).set('Idempotency-Key', key).send(body).expect(201)
    expect(created.body.copyright_uk_redress_request.is_duplicate).toBe(false)
    const replay = await staffRequest.post(url).set('Idempotency-Key', key).send(body).expect(200)
    expect(replay.body.copyright_uk_redress_request).toMatchObject({
      id: created.body.copyright_uk_redress_request.id,
      is_duplicate: true,
    })
  })

  it.each([
    ['an unknown key', { injected: true }],
    ['a CAPTCHA token, which a staff entry never carries', { cf_turnstile_response: 'token' }],
  ])('rejects %s before recording the complaint', async (_label, extra) => {
    const { staffRequest, url } = await determinedUkNotice()
    const key = crypto.randomUUID()

    await staffRequest
      .post(url)
      .set('Idempotency-Key', key)
      .send({ ...body, ...extra })
      .expect(422)
    // Nothing was recorded, so the same key creates the complaint instead of replaying one.
    const created = await staffRequest.post(url).set('Idempotency-Key', key).send(body).expect(201)
    expect(created.body.copyright_uk_redress_request.is_duplicate).toBe(false)
  })

  it('keeps the explanation message and the path id check', async () => {
    const { staffRequest, url } = await determinedUkNotice()

    const rejected = await staffRequest
      .post(url)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ explanation: 7 })
      .expect(422)
    expect(rejected.body.message).toBe('explanation is required')
    await staffRequest
      .post(`${BASE}/not-a-uuid/redress-requests`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body)
      .expect(422)
  })

  it('leaves the missing-notice 404 to the service behind a malformed body', async () => {
    const { staffRequest } = await determinedUkNotice()
    const url = `${BASE}/${crypto.randomUUID()}/redress-requests`

    await staffRequest.post(url).set('Idempotency-Key', crypto.randomUUID()).send(body).expect(404)
    await staffRequest
      .post(url)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ ...body, injected: true })
      .expect(422)
  })
})
