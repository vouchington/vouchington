import { describe, expect, it } from 'vitest'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '@services/copyright-notices/read-models-staff'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'

const NOTICES = '/api/v1/copyright-notices'
const INCIDENTS = '/api/v1/copyright-repeat-infringer-incidents'
const REVIEWS = '/api/v1/copyright-repeat-infringer-reviews'
const ACCOUNTS = '/api/v1/copyright-repeat-infringer-accounts'

type Staff = ReturnType<typeof createRequest>
type Account = { incident_id: string; operative: boolean; open_review_id: string | null }

async function readAccount(staff: Staff, noticeId: string): Promise<Account> {
  const response = await staff.get(`${NOTICES}/${noticeId}/repeat-infringer-accounts`).expect(200)
  return response.body.copyright_repeat_infringer_accounts[0] as Account
}

async function repeatInfringerFixture() {
  const [poster, moderator, admin] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  const noticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator, 'repeat contract')
  await confirmTestRepeatInfringerNotice(poster.id, moderator, 'repeat contract')
  const staff = createRequest()
  await staff.authenticateAs(moderator)
  const administrator = createRequest()
  await administrator.authenticateAs(admin)
  const account = await readAccount(staff, noticeId)
  if (!account.operative || !account.open_review_id) throw new Error('repeat infringer fixture')
  return { poster, noticeId, account, reviewId: account.open_review_id, staff, administrator }
}

describe('repeat-infringer request contracts', () => {
  it('keeps a bare 401 and 403 ahead of any schema diagnostic', async () => {
    const url = `${INCIDENTS}/${crypto.randomUUID()}/dispositions`
    const anonymous = await createRequest().post(url).send({ injected: true }).expect(401)
    expect(anonymous.text).not.toMatch(/schema|must be|required|invalid/i)
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    await member.post(url).send({ injected: true }).expect(403)
  })

  it('rejects a malformed notice id on the account list after authentication', async () => {
    const { staff } = await repeatInfringerFixture()

    await staff.get(`${NOTICES}/not-a-uuid/repeat-infringer-accounts`).expect(422)
    await createRequest().get(`${NOTICES}/not-a-uuid/repeat-infringer-accounts`).expect(401)
  })

  it('rejects an unknown key or malformed id on a disposition before recording it', async () => {
    const { noticeId, account, staff } = await repeatInfringerFixture()
    const url = `${INCIDENTS}/${account.incident_id}/dispositions`
    const body = { disposition: 'abusive', rationale: 'The notice was filed in bad faith.' }

    await staff
      .post(url)
      .send({ ...body, injected: true })
      .expect(422)
    await staff.post(`${INCIDENTS}/not-a-uuid/dispositions`).send(body).expect(422)
    const missing = await staff.post(url).send({ disposition: 'duplicate' }).expect(422)
    expect(missing.body.message).toBe('rationale is required')
    expect((await readAccount(staff, noticeId)).operative).toBe(true)

    await staff.post(url).send(body).expect(200)
    expect((await readAccount(staff, noticeId)).operative).toBe(false)
  })

  it('rejects an unknown key or malformed id on an outcome before recording it', async () => {
    const { noticeId, reviewId, staff } = await repeatInfringerFixture()
    const url = `${REVIEWS}/${reviewId}/outcomes`
    const body = { outcome: 'no_action', rationale: 'One incident no longer counts.' }

    await staff
      .post(url)
      .send({ ...body, injected: true })
      .expect(422)
    await staff.post(`${REVIEWS}/not-a-uuid/outcomes`).send(body).expect(422)
    const unknown = await staff
      .post(url)
      .send({ outcome: 'ban', rationale: 'Not an outcome.' })
      .expect(422)
    expect(unknown.body.message).toBe('outcome must be warning, no_action, restrict, or terminate')
    expect((await readAccount(staff, noticeId)).open_review_id).toBe(reviewId)

    await staff.post(url).send(body).expect(200)
    expect((await readAccount(staff, noticeId)).open_review_id).toBeNull()
  })

  it('rejects an unknown key or malformed id on a reinstatement before the service runs', async () => {
    const { poster, administrator } = await repeatInfringerFixture()
    const url = `${ACCOUNTS}/${poster.id}/reinstatements`
    const body = { rationale: 'No termination is in effect.' }

    await administrator
      .post(url)
      .send({ ...body, injected: true })
      .expect(422)
    await administrator.post(`${ACCOUNTS}/not-a-uuid/reinstatements`).send(body).expect(422)

    // The service rejects a reinstatement with no termination in effect, so 409 proves a
    // well-formed request reached it.
    await administrator.post(url).send(body).expect(409)
  })

  // A JSON `null` used to throw a TypeError (500) when a handler read `rationale` from it.
  it.each(['null', '[]'])('answers 422 on the body %s for every decision route', async raw => {
    const { poster, noticeId, account, reviewId, staff, administrator } =
      await repeatInfringerFixture()
    const routes = [
      [staff, `${INCIDENTS}/${account.incident_id}/dispositions`],
      [staff, `${REVIEWS}/${reviewId}/outcomes`],
      [administrator, `${ACCOUNTS}/${poster.id}/reinstatements`],
    ] as const

    for (const [client, url] of routes) {
      const response = await client
        .post(url)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    }
    expect(await readAccount(staff, noticeId)).toEqual(account)
  })

  it('shows a moderator the schema 422 before the administrator-only 403', async () => {
    const { reviewId, staff } = await repeatInfringerFixture()
    const url = `${REVIEWS}/${reviewId}/outcomes`
    const rationale = 'Repeat infringement.'

    await staff.post(url).send({ outcome: 'restrict', rationale, injected: true }).expect(422)
    await staff.post(url).send({ outcome: 'restrict', rationale }).expect(403)
  })

  describe('GET /copyright-notices/review-queue', () => {
    // The shared pagination parser owns every query rejection (400) and runs first, so the
    // generated query carrier is a drift guard: it never turns a parsed request into a 422.
    it('keeps the parser statuses and the authorization statuses', async () => {
      const staff = createRequest()
      await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
      const member = createRequest()
      await member.authenticateAs(await createTestUser())

      await staff.get(`${NOTICES}/review-queue?limit=0`).expect(400)
      await staff.get(`${NOTICES}/review-queue?after=a&after=b`).expect(400)
      // A synthetic keyset cursor past every real case keeps the shared-database read scoped.
      const after = encodeScopedTierPreciseUuidCursor(
        '2999-01-01T00:00:00.000000Z',
        2,
        crypto.randomUUID(),
        copyrightStaffQueueCursorScope,
      )
      const page = await staff
        .get(`${NOTICES}/review-queue?limit=1&injected=1&after=${encodeURIComponent(after)}`)
        .expect(200)
      expect(page.body.copyright_notices).toEqual([])
      await member.get(`${NOTICES}/review-queue?limit=0`).expect(403)
      await createRequest().get(`${NOTICES}/review-queue?limit=0`).expect(401)
    })
  })
})
