import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readCopyrightEmailIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const INTAKES = '/api/v1/copyright-email-intakes'
const INVALID_BODY = 'Invalid request body'
const RATIONALE = 'Staff reviewed the email.'
const FALLBACK = 'No recommendation is available.'
const DECISION_ROUTES = ['approvals', 'rejections', 'correspondence', 'correspondence-rejections']

async function createStaff() {
  const staff = createRequest()
  await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return staff
}

const decision = { rationale: RATIONALE, manual_fallback_reason: FALLBACK }
const supplement = {
  ...decision,
  kind: 'supplement',
  submission_summary: 'More hosted-use detail.',
}

describe('copyright email intake request contracts', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('authentication', () => {
    it.each(DECISION_ROUTES)(
      'keeps a bare 401 and 403 on %s ahead of any schema diagnostic',
      async route => {
        const url = `${INTAKES}/${crypto.randomUUID()}/${route}`
        const anonymous = await createRequest().post(url).send({ injected: true }).expect(401)
        expect(anonymous.text).not.toMatch(/schema|must be|required|invalid/i)
        const member = createRequest()
        await member.authenticateAs(await createTestUser())
        await member.post(url).send({ injected: true }).expect(403)
      },
    )

    it.each(['', '/raw'])('keeps a bare 401 and 403 on the intake read %s', async suffix => {
      const url = `${INTAKES}/not-a-uuid${suffix}`
      await createRequest().get(url).expect(401)
      const member = createRequest()
      await member.authenticateAs(await createTestUser())
      await member.get(url).expect(403)
    })
  })

  describe('non-object bodies', () => {
    // A JSON `null` used to throw a TypeError (500) when the shared review reader read a field.
    it.each(DECISION_ROUTES.flatMap(route => ['null', '[]'].map(raw => [route, raw])))(
      'answers 422 on %s for the body %s and records no decision',
      async (route, raw) => {
        const intake = await createParsedCopyrightEmailIntake()
        const staff = await createStaff()
        const response = await staff
          .post(`${INTAKES}/${intake.id}/${route}`)
          .set('Content-Type', 'application/json')
          .send(raw)
          .expect(422)
        expect(response.body.message).toBe(INVALID_BODY)
        await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
      },
    )
  })

  describe('GET /copyright-email-intakes/:id and /:id/raw', () => {
    it.each(['', '/raw'])('rejects a malformed id on the read %s', async suffix => {
      const staff = await createStaff()
      await staff.get(`${INTAKES}/not-a-uuid${suffix}`).expect(422)
    })

    it('reads an intake and answers an unknown id as not found', async () => {
      const intake = await createParsedCopyrightEmailIntake()
      const staff = await createStaff()
      const found = await staff.get(`${INTAKES}/${intake.id}`).expect(200)
      expect(found.body.copyright_email_intake.id).toBe(intake.id)
      await staff.get(`${INTAKES}/${crypto.randomUUID()}`).expect(404)
      await staff.get(`${INTAKES}/${crypto.randomUUID()}/raw`).expect(404)
    })
  })

  describe('POST /copyright-email-intakes/:id/reply/replays', () => {
    it('rejects a malformed id and replays nothing for an unknown intake', async () => {
      const staff = await createStaff()
      await staff.post(`${INTAKES}/not-a-uuid/reply/replays`).expect(422)
      const unknown = await staff
        .post(`${INTAKES}/${crypto.randomUUID()}/reply/replays`)
        .expect(200)
      expect(unknown.body).toEqual({ replayed: false })
    })
  })

  describe('POST /copyright-email-intakes/:id/approvals', () => {
    it('rejects an unknown key before the notice is promoted, then approves the valid body', async () => {
      const fixture = await createCopyrightFormFixture()
      const intake = await createParsedCopyrightEmailIntake()
      const staff = await createStaff()
      const url = `${INTAKES}/${intake.id}/approvals`
      const body = { ...fixture.form, ...decision }

      const unknownKey = await staff
        .post(url)
        .send({ ...body, injected: true })
        .expect(422)
      expect(unknownKey.body.message).toBe(INVALID_BODY)
      const [target] = body.targets
      const unknownTargetKey = await staff
        .post(url)
        .send({ ...body, targets: [{ ...target!, injected: true }] })
        .expect(422)
      expect(unknownTargetKey.body.message).toBe(INVALID_BODY)
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])

      await staff.post(url).send(body).expect(201)
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([
        { decision: 'approved', promoted_copyright_notice_id: expect.any(String) },
      ])
    })

    it('keeps the field-named parser message ahead of the schema diagnostic', async () => {
      const fixture = await createCopyrightFormFixture()
      const staff = await createStaff()
      const url = `${INTAKES}/${crypto.randomUUID()}/approvals`
      const body = { ...fixture.form, ...decision }

      const badSignature = await staff
        .post(url)
        .send({ ...body, electronic_signature: '', injected: true })
        .expect(422)
      expect(badSignature.body.message).toBe('electronic_signature is required')
      const badFallback = await staff
        .post(url)
        .send({ ...body, manual_fallback_reason: 7, injected: true })
        .expect(422)
      expect(badFallback.body.message).toBe(
        'manual_fallback_reason must be a bounded string or null',
      )
      const badAttestation = await staff
        .post(url)
        .send({ ...body, has_good_faith_belief: false })
        .expect(422)
      expect(badAttestation.body.message).toBe('has_good_faith_belief must be accepted')
    })
  })

  describe('POST /copyright-email-intakes/:id/rejections', () => {
    it('rejects an unknown key or a non-string response before recording a rejection', async () => {
      const intake = await createParsedCopyrightEmailIntake()
      const staff = await createStaff()
      const url = `${INTAKES}/${intake.id}/rejections`

      const unknownKey = await staff
        .post(url)
        .send({ ...decision, injected: true })
        .expect(422)
      expect(unknownKey.body.message).toBe(INVALID_BODY)
      const wrongType = await staff
        .post(url)
        .send({ ...decision, response_kind: 'rejected', response_message: 42 })
        .expect(422)
      expect(wrongType.body.message).toBe(INVALID_BODY)
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])

      await staff
        .post(url)
        .send({ ...decision, response_kind: 'rejected', response_message: 'Not a notice.' })
        .expect(200)
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([
        { decision: 'rejected', promoted_copyright_notice_id: null },
      ])
    })

    it('keeps the field-named parser message ahead of the schema diagnostic', async () => {
      const staff = await createStaff()
      const url = `${INTAKES}/${crypto.randomUUID()}/rejections`

      const badRecommendation = await staff
        .post(url)
        .send({ rationale: RATIONALE, recommendation_id: 'nope', injected: true })
        .expect(422)
      expect(badRecommendation.body.message).toBe('recommendation_id must be a UUID or null')
      const badReply = await staff
        .post(url)
        .send({ ...decision, reply_email: 'nope', injected: true })
        .expect(422)
      expect(badReply.body.message).toBe('reply_email must be a valid email address or null')
      const badKind = await staff
        .post(url)
        .send({ ...decision, response_kind: 'ignored', injected: true })
        .expect(422)
      expect(badKind.body.message).toBe('response_kind must be rejected or needs_information')
    })
  })

  describe('POST /copyright-email-intakes/:id/correspondence', () => {
    // An unknown intake is the service's 404, so a 422 here means the request never reached it.
    it('rejects an unknown key or a mistyped kind-specific key before the service runs', async () => {
      const staff = await createStaff()
      const url = `${INTAKES}/${crypto.randomUUID()}/correspondence`

      const unknownKey = await staff
        .post(url)
        .send({ ...supplement, injected: true })
        .expect(422)
      expect(unknownKey.body.message).toBe(INVALID_BODY)
      const mistyped = await staff
        .post(url)
        .send({ ...supplement, consent_to_service_of_process: false })
        .expect(422)
      expect(mistyped.body.message).toBe(INVALID_BODY)
      const ignoredTargets = await staff
        .post(url)
        .send({ ...supplement, target_ids: ['not-a-uuid'] })
        .expect(422)
      expect(ignoredTargets.body.message).toBe(INVALID_BODY)

      await staff.post(url).send(supplement).expect(404)
    })

    it('keeps the kind-specific parser messages ahead of the schema diagnostic', async () => {
      const staff = await createStaff()
      const url = `${INTAKES}/${crypto.randomUUID()}/correspondence`

      const kind = await staff
        .post(url)
        .send({ ...decision, kind: 'ignored', injected: true })
        .expect(422)
      expect(kind.body.message).toBe('Invalid correspondence kind')
      const appeal = await staff
        .post(url)
        .send({ ...decision, kind: 'appeal', target_ids: [crypto.randomUUID()], injected: true })
        .expect(422)
      expect(appeal.body.message).toBe('appeal_reason is required')
    })
  })

  describe('POST /copyright-email-intakes/:id/correspondence-rejections', () => {
    it('rejects an unknown key or kind before the service runs', async () => {
      const staff = await createStaff()
      const url = `${INTAKES}/${crypto.randomUUID()}/correspondence-rejections`
      const body = { ...decision, kind: 'withdrawal' }

      const unknownKey = await staff
        .post(url)
        .send({ ...body, injected: true })
        .expect(422)
      expect(unknownKey.body.message).toBe(INVALID_BODY)
      const kind = await staff
        .post(url)
        .send({ ...body, kind: 'ignored' })
        .expect(422)
      expect(kind.body.message).toBe('Invalid correspondence kind')

      await staff.post(url).send(body).expect(404)
    })
  })
})
