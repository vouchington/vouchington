import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  TERRITORIAL_SURFACES,
  approveJurisdictionPolicy,
  createTerritorialActors,
  seedDeterminedTerritorialNotice,
  territorialNoticeBody,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'

// A caller the handler turns away answers with a bare status, never a schema diagnostic.
const SCHEMA_DIAGNOSTIC = /schema|must be|required|invalid/i

const MALFORMED_FIELDS = [
  ['an unknown key', { injected: true }],
  ['a non-string cf_turnstile_response', { cf_turnstile_response: 7 }],
  ['a null cf_turnstile_response', { cf_turnstile_response: null }],
] as const

describe.each(TERRITORIAL_SURFACES)('$label claimant request contracts', surface => {
  useCopyrightIntakeEnvironment()

  it('keeps 401 ahead of the schema diagnostic on the notice and redress routes', async () => {
    const anonymous = createRequest()
    const notice = await anonymous
      .post(surface.base)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ injected: true })
      .expect(401)
    expect(notice.text).not.toMatch(SCHEMA_DIAGNOSTIC)
    const redress = await anonymous
      .post(`${surface.base}/${crypto.randomUUID()}/redress-requests`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ injected: true })
      .expect(401)
    expect(redress.text).not.toMatch(SCHEMA_DIAGNOSTIC)
  })

  describe('with intake closed', () => {
    useCopyrightIntakeEnvironment({ enabled: false })

    it('keeps the kill switch ahead of the schema diagnostic', async () => {
      const { claimantRequest } = await createTerritorialActors()
      await claimantRequest
        .post(surface.base)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ...territorialNoticeBody(surface.jurisdiction), injected: true })
        .expect(503)
    })
  })

  it.each(MALFORMED_FIELDS)('rejects %s on a notice before recording it', async (_label, extra) => {
    const { claimantRequest, administrator } = await createTerritorialActors()
    await approveJurisdictionPolicy(administrator, surface.jurisdiction)
    const body = territorialNoticeBody(surface.jurisdiction)
    const key = crypto.randomUUID()

    await claimantRequest
      .post(surface.base)
      .set('Idempotency-Key', key)
      .send({ ...body, ...extra })
      .expect(422)
    // Nothing was recorded, so the same key creates the notice instead of replaying one.
    const created = await claimantRequest
      .post(surface.base)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201)
    expect(created.body[surface.receiptField].is_duplicate).toBe(false)
  })

  it('accepts a string cf_turnstile_response on a notice', async () => {
    const { claimantRequest, administrator } = await createTerritorialActors()
    await approveJurisdictionPolicy(administrator, surface.jurisdiction)

    await claimantRequest
      .post(surface.base)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        ...territorialNoticeBody(surface.jurisdiction),
        cf_turnstile_response: 'turnstile-token',
      })
      .expect(201)
  })

  it.each([
    ['contact', 7, 'contact is required'],
    ['content_description', null, 'content_description is required'],
    ['grounds', 7, 'grounds are required'],
    ['hosted_use_url', 7, 'hosted_use_url is required'],
  ])('keeps the %s message for a mistyped notice field', async (field, value, message) => {
    const { claimantRequest } = await createTerritorialActors()

    const rejected = await claimantRequest
      .post(surface.base)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ ...territorialNoticeBody(surface.jurisdiction), [field]: value })
      .expect(422)
    expect(rejected.body.message).toBe(message)
  })

  it.each(MALFORMED_FIELDS)(
    'rejects %s on a redress request before recording it',
    async (_label, extra) => {
      const actors = await createTerritorialActors()
      await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
      const noticeId = await seedDeterminedTerritorialNotice(surface.jurisdiction, actors)
      const url = `${surface.base}/${noticeId}/redress-requests`
      const key = crypto.randomUUID()
      const body = { explanation: 'Please review this restriction' }

      await actors.claimantRequest
        .post(url)
        .set('Idempotency-Key', key)
        .send({ ...body, ...extra })
        .expect(422)
      const created = await actors.claimantRequest
        .post(url)
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201)
      expect(created.body[surface.redressField].is_duplicate).toBe(false)
    },
  )

  it('keeps the redress explanation message and the path id check', async () => {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
    const noticeId = await seedDeterminedTerritorialNotice(surface.jurisdiction, actors)
    const key = crypto.randomUUID()

    const rejected = await actors.claimantRequest
      .post(`${surface.base}/${noticeId}/redress-requests`)
      .set('Idempotency-Key', key)
      .send({ explanation: 7 })
      .expect(422)
    expect(rejected.body.message).toBe('explanation is required')
    await actors.claimantRequest
      .post(`${surface.base}/not-a-uuid/redress-requests`)
      .set('Idempotency-Key', key)
      .send({ explanation: 'Please review this restriction' })
      .expect(422)
  })

  // The service decides existence, so a missing notice is a 404 for a valid body only.
  it('leaves the missing-notice 404 to the service behind a malformed body', async () => {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
    const url = `${surface.base}/${crypto.randomUUID()}/redress-requests`
    const body = { explanation: 'Please review this restriction' }

    await actors.claimantRequest
      .post(url)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body)
      .expect(404)
    await actors.claimantRequest
      .post(url)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ ...body, injected: true })
      .expect(422)
  })

  // The service decides ownership, so a stranger's valid redress is a 403 while a malformed body
  // is still a 422: a documented consequence of validating before the service runs.
  it('leaves the ownership 403 to the service behind a malformed body', async () => {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
    const noticeId = await seedDeterminedTerritorialNotice(surface.jurisdiction, actors)
    const url = `${surface.base}/${noticeId}/redress-requests`
    const body = { explanation: 'Please review this restriction' }

    await actors.strangerRequest
      .post(url)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body)
      .expect(403)
    await actors.strangerRequest
      .post(url)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ ...body, injected: true })
      .expect(422)
  })
})

describe('EU supervised complaint request contract', () => {
  useCopyrightIntakeEnvironment()
  const [eu] = TERRITORIAL_SURFACES

  async function complaintFixture() {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, 'eu_dsa')
    const noticeId = await seedDeterminedTerritorialNotice('eu_dsa', actors)
    return { ...actors, url: `${eu!.base}/${noticeId}/supervised-complaints` }
  }

  it('keeps 401 ahead of the schema diagnostic', async () => {
    const anonymous = await createRequest()
      .post(`${eu!.base}/${crypto.randomUUID()}/supervised-complaints`)
      .send({ injected: true })
      .expect(401)
    expect(anonymous.text).not.toMatch(SCHEMA_DIAGNOSTIC)
  })

  it('rejects an unknown key before recording the complaint', async () => {
    const { claimantRequest, url } = await complaintFixture()
    const body = {
      authority_reference: `dsc-${crypto.randomUUID()}`,
      explanation: 'Complaint filed with the authority',
    }

    await claimantRequest
      .post(url)
      .send({ ...body, injected: true })
      .expect(422)
    // A recorded complaint would make the same reference a 409 instead of a 201.
    const created = await claimantRequest.post(url).send(body).expect(201)
    expect(created.body.copyright_eu_supervised_complaint.escalation_id).toEqual(expect.any(String))
  })

  it.each([
    ['authority_reference', 'authority_reference is required'],
    ['explanation', 'explanation is required'],
  ])('keeps the %s message for a mistyped field', async (field, message) => {
    const { claimantRequest, url } = await complaintFixture()
    const body = { authority_reference: `dsc-${crypto.randomUUID()}`, explanation: 'Complaint' }

    const rejected = await claimantRequest
      .post(url)
      .send({ ...body, [field]: 7 })
      .expect(422)
    expect(rejected.body.message).toBe(message)
  })

  it('leaves the missing-notice 404 to the service behind a malformed body', async () => {
    const { claimantRequest } = await complaintFixture()
    const url = `${eu!.base}/${crypto.randomUUID()}/supervised-complaints`
    const body = { authority_reference: `dsc-${crypto.randomUUID()}`, explanation: 'Complaint' }

    await claimantRequest.post(url).send(body).expect(404)
    await claimantRequest
      .post(url)
      .send({ ...body, injected: true })
      .expect(422)
  })

  it('checks the path id and leaves the ownership 403 to the service', async () => {
    const { claimantRequest, strangerRequest, url } = await complaintFixture()
    const body = { authority_reference: `dsc-${crypto.randomUUID()}`, explanation: 'Complaint' }

    await claimantRequest
      .post(`${eu!.base}/not-a-uuid/supervised-complaints`)
      .send(body)
      .expect(422)
    await strangerRequest.post(url).send(body).expect(403)
    await strangerRequest
      .post(url)
      .send({ ...body, injected: true })
      .expect(422)
  })
})
