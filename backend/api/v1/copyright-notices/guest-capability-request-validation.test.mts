import { seedCopyrightGuestCapabilities } from '@voucha/test-helpers/copyright-staff-case-states'
import { readApiGuestState } from '@voucha/test-helpers/copyright-api-guest-state'
import {
  assertApiGuestCapabilityIssue,
  assertApiGuestCapabilityRevoke,
} from '@voucha/test-helpers/copyright-api-guest-capability-outcomes'
import { assertApiGuestFiling } from '@voucha/test-helpers/copyright-api-guest-filing-outcome'
import { assertApiGuestInformation } from '@voucha/test-helpers/copyright-api-guest-information-outcome'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { recordTestClaimantEmailReceipt } from '@voucha/test-helpers/services/copyright-notices/claimant-delivery'
import { openTestGuestCopyrightNotice } from '@voucha/test-helpers/services/copyright-notices/guest-capability'

const NOTICES = '/api/v1/copyright-notices'
const GUEST_HEADER = 'Copyright-Guest-Capability'
const dayMs = 24 * 60 * 60 * 1000

function expiry(): string {
  return new Date(Date.now() + 7 * dayMs).toISOString()
}

async function staffFixture() {
  const noticeId = await openTestGuestCopyrightNotice()
  const staff = createRequest()
  const actor = await createTestUser({ extraRoles: ['moderator'] })
  await staff.authenticateAs(actor)
  return { noticeId, staff, actor }
}

async function issuedCapability() {
  const fixture = await staffFixture()
  const capabilities = await seedCopyrightGuestCapabilities({
    noticeId: fixture.noticeId,
    issuedById: fixture.actor.id,
    expiresAt: new Date(expiry()),
    count: 1,
  })
  const capability = capabilities[0]
  if (!capability) throw new Error('Committed guest capability missing')
  return { ...fixture, capability }
}

describe('copyright guest capability request contracts', () => {
  describe('POST /copyright-notices/:id/guest-capabilities', () => {
    it('keeps a bare 401 and 403 ahead of any schema diagnostic', async () => {
      const url = `${NOTICES}/${crypto.randomUUID()}/guest-capabilities`
      const anonymous = await createRequest().post(url).send({ injected: true }).expect(401)
      expect(anonymous.body.message).not.toMatch(/schema|must be|required|invalid/i)
      const member = createRequest()
      await member.authenticateAs(await createTestUser())
      await member.post(url).send({ injected: true }).expect(403)
    })

    it('rejects an unknown key, a bad expiry, and a malformed id without issuing', async () => {
      const { noticeId, staff, actor } = await staffFixture()
      const url = `${NOTICES}/${noticeId}/guest-capabilities`

      const before = await readApiGuestState(noticeId)
      await staff.post(url).send({ expires_at: expiry(), injected: true }).expect(422)
      const badExpiry = await staff.post(url).send({ expires_at: 5 }).expect(422)
      expect(badExpiry.body.message).toBe('expires_at must be a future instant')
      await staff
        .post(`${NOTICES}/not-a-uuid/guest-capabilities`)
        .send({ expires_at: expiry() })
        .expect(422)

      const listed = await staff.get(url).expect(200)
      expect(listed.body.copyright_guest_capabilities).toEqual([])
      expect(await readApiGuestState(noticeId)).toEqual(before)
      await assertApiGuestCapabilityIssue(staff, noticeId, actor.id, expiry())
    })
  })

  describe('POST /copyright-notices/:id/guest-capabilities/:capabilityId/revocation', () => {
    it('rejects a malformed path id before revoking, then revokes', async () => {
      const { noticeId, staff, capability, actor } = await issuedCapability()
      const base = `${NOTICES}/${noticeId}/guest-capabilities`

      const before = await readApiGuestState(noticeId)
      await staff.post(`${base}/not-a-uuid/revocation`).expect(422)
      await staff
        .post(`${NOTICES}/not-a-uuid/guest-capabilities/${capability.id}/revocation`)
        .expect(422)
      const listed = await staff.get(base).expect(200)
      expect(listed.body.copyright_guest_capabilities[0].revoked_at).toBeNull()

      expect(await readApiGuestState(noticeId)).toEqual(before)
      await assertApiGuestCapabilityRevoke(staff, noticeId, capability.id, actor.id)
    })
  })

  describe('POST /copyright-notices/:id/guest-capabilities/:capabilityId/information-requests', () => {
    it('rejects an unknown key, a bad statement, and a malformed id, then records', async () => {
      const { noticeId, staff, capability, actor } = await issuedCapability()
      await recordTestClaimantEmailReceipt(noticeId)
      const url = `${NOTICES}/${noticeId}/guest-capabilities/${capability.id}/information-requests`
      const statement = 'Send the registration number.'

      const before = await readApiGuestState(noticeId)
      await staff.post(url).send({ statement, injected: true }).expect(422)
      const badStatement = await staff.post(url).send({ statement: 5 }).expect(422)
      expect(badStatement.body.message).toBe('statement is required')
      await staff
        .post(`${NOTICES}/${noticeId}/guest-capabilities/not-a-uuid/information-requests`)
        .send({ statement })
        .expect(422)

      expect(await readApiGuestState(noticeId)).toEqual(before)
      await assertApiGuestInformation({
        staff,
        noticeId,
        capabilityId: capability.id,
        actorId: actor.id,
        statement,
      })
    })
  })

  describe('POST /copyright-notices/:id/guest-filings', () => {
    it.each([
      ['an unknown key', { injected: true }],
      ['a non-string cf_turnstile_response', { cf_turnstile_response: 7 }],
      ['a null cf_turnstile_response', { cf_turnstile_response: null }],
    ])('rejects %s before the capability is used', async (_label, extra) => {
      const { noticeId, capability } = await issuedCapability()
      const guest = createRequest()
      const url = `${NOTICES}/${noticeId}/guest-filings`
      const filing = { kind: 'court_or_ccb_hold', statement: 'A court action was filed.' }

      const before = await readApiGuestState(noticeId)
      await guest
        .post(url)
        .set(GUEST_HEADER, capability.token)
        .send({ ...filing, ...extra })
        .expect(422)

      expect(await readApiGuestState(noticeId)).toEqual(before)
      // The actual same-capability writer remains non-duplicate or atomically aborts on SSI.
      await assertApiGuestFiling({
        noticeId,
        capability,
        kind: 'court_or_ccb_hold',
        statement: filing.statement,
      })
    })

    it('accepts the optional CAPTCHA token as a string', async () => {
      const { noticeId, capability } = await issuedCapability()

      expect.hasAssertions()
      await assertApiGuestFiling({
        noticeId,
        capability,
        kind: 'supplement',
        statement: 'A correction.',
        captcha: 'token',
      })
    })

    it('keeps the capability 403 and the field-named 422 ahead of the schema diagnostic', async () => {
      const { noticeId, capability } = await issuedCapability()
      const guest = createRequest()
      const url = `${NOTICES}/${noticeId}/guest-filings`

      const before = await readApiGuestState(noticeId)
      await guest.post(url).send({ kind: 'supplement', statement: 'x', injected: true }).expect(403)
      const kind = await guest
        .post(url)
        .set(GUEST_HEADER, capability.token)
        .send({ kind: 'poem', statement: 'x', injected: true })
        .expect(422)
      expect(kind.body.message).toBe('kind is not a guest filing')
      expect(await readApiGuestState(noticeId)).toEqual(before)
    })

    it('rejects a malformed notice id', async () => {
      const { capability, noticeId } = await issuedCapability()
      const before = await readApiGuestState(noticeId)
      await createRequest()
        .post(`${NOTICES}/not-a-uuid/guest-filings`)
        .set(GUEST_HEADER, capability.token)
        .send({ kind: 'supplement', statement: 'x' })
        .expect(422)
      expect(await readApiGuestState(noticeId)).toEqual(before)
    })

    // Rejections below 500 are never logged by the API error hook, so the response body is the
    // observable disclosure surface; the route never passes the header to the validator.
    it('never echoes the capability in a rejection body', async () => {
      const { noticeId, capability } = await issuedCapability()

      const before = await readApiGuestState(noticeId)
      const response = await createRequest()
        .post(`${NOTICES}/${noticeId}/guest-filings`)
        .set(GUEST_HEADER, capability.token)
        .send({ kind: 'supplement', statement: 'x', injected: true })
        .expect(422)

      expect(response.text).not.toContain(capability.token)
      expect(await readApiGuestState(noticeId)).toEqual(before)
    })
  })

  describe('GET /copyright-notices/:id/guest-capabilities', () => {
    // The shared pagination parser owns every query rejection (400) and runs first, so the
    // generated query carrier is a drift guard: it never turns a parsed request into a 422.
    it('rejects a malformed id and keeps the parser statuses', async () => {
      const { noticeId, staff } = await staffFixture()
      const url = `${NOTICES}/${noticeId}/guest-capabilities`

      const before = await readApiGuestState(noticeId)
      await staff.get(`${NOTICES}/not-a-uuid/guest-capabilities`).expect(422)
      await staff.get(`${url}?limit=0`).expect(400)
      await staff.get(`${url}?after=a&after=b`).expect(400)
      await staff.get(`${url}?limit=1&injected=1`).expect(200)
      await createRequest().get(`${url}?limit=0`).expect(401)
      expect(await readApiGuestState(noticeId)).toEqual(before)
    })
  })
})
