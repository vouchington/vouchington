import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertEncryptedCopyrightHoldSubmission } from '@voucha/test-helpers/data-stores/psql/copyright-hold-submission'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createRetentionSignedInForm } from '@voucha/test-helpers/services/copyright-notices/retention-signed-in-form'

const INVALID_BODY = 'Invalid request body'
const RATIONALE = 'The staff decision stands after review.'
const FORM_REVIEW = { accepted: true, rationale: RATIONALE }
const RESOLUTION = { resolution_kind: 'dismissed', rationale: RATIONALE }
const RESTRICTION_REVIEW = { action: 'confirm', rationale: RATIONALE }

function formReviewUrl(id: string) {
  return `/api/v1/copyright-form-intakes/${id}/reviews`
}
function resolutionUrl(id: string) {
  return `/api/v1/copyright-legal-hold-assessments/${id}/resolutions`
}
function restrictionUrl(noticeId: string, restrictionId: string) {
  return `/api/v1/copyright-notices/${noticeId}/restrictions/${restrictionId}/reviews`
}

async function createStaff() {
  const staff = createRequest()
  await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return staff
}

/** A notice whose provisional restriction still awaits its mandatory human review. */
async function createRestrictedCase() {
  const { copyright_notice_id: noticeId } = await createRetentionSignedInForm(
    (await createTestUser()).id,
  )
  const restrictionId = (await getCopyrightNoticePrivateAggregate(noticeId))?.restrictions[0]?.id
  if (!restrictionId) throw new Error('fixture restriction missing')
  return { noticeId, restrictionId, targetId: await readCopyrightNoticeTargetId(noticeId) }
}

describe('copyright staff decision request contracts', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checks that stay ahead of the schema', () => {
    const urls = () => {
      const id = crypto.randomUUID()
      return [
        formReviewUrl(id),
        resolutionUrl(id),
        restrictionUrl(id, crypto.randomUUID()),
      ] as const
    }

    it('keeps a bare 401 and 403 ahead of any schema diagnostic', async () => {
      const member = createRequest()
      await member.authenticateAs(await createTestUser())
      for (const url of urls()) {
        const anonymous = await createRequest().post(url).send({ injected: true }).expect(401)
        expect(anonymous.text).not.toMatch(/schema|must be|required|invalid/i)
        await member.post(url).send({ injected: true }).expect(403)
      }
    })

    it('keeps the content-type check ahead of the schema', async () => {
      const staff = await createStaff()
      for (const url of urls()) {
        await staff
          .post(url)
          .set('Content-Type', 'text/plain')
          .send('{"injected":true}')
          .expect(415)
      }
    })

    it('rejects a malformed path id on every route', async () => {
      const staff = await createStaff()
      const id = crypto.randomUUID()
      await staff.post(formReviewUrl('not-a-uuid')).send(FORM_REVIEW).expect(422)
      await staff.post(resolutionUrl('not-a-uuid')).send(RESOLUTION).expect(422)
      await staff.post(restrictionUrl('not-a-uuid', id)).send(RESTRICTION_REVIEW).expect(422)
      await staff.post(restrictionUrl(id, 'not-a-uuid')).send(RESTRICTION_REVIEW).expect(422)
    })

    it.each(['null', '[]'])('answers 422, not 500, for the JSON body %s', async raw => {
      const staff = await createStaff()
      for (const url of urls()) {
        const response = await staff
          .post(url)
          .set('Content-Type', 'application/json')
          .send(raw)
          .expect(422)
        expect(response.body.message).toBe(INVALID_BODY)
      }
    })
  })

  describe('POST /copyright-form-intakes/:id/reviews', () => {
    // An unknown intake is the service's 404, so a 422 here means the request never reached it.
    it('rejects an unknown key before the service runs', async () => {
      const staff = await createStaff()
      const url = formReviewUrl(crypto.randomUUID())

      const rejected = await staff
        .post(url)
        .send({ ...FORM_REVIEW, injected: true })
        .expect(422)
      expect(rejected.body.message).toBe(INVALID_BODY)

      await staff.post(url).send(FORM_REVIEW).expect(404)
    })

    it('keeps the field-named parser messages ahead of the schema diagnostic', async () => {
      const staff = await createStaff()
      const url = formReviewUrl(crypto.randomUUID())

      const accepted = await staff
        .post(url)
        .send({ ...FORM_REVIEW, accepted: 'yes', injected: true })
        .expect(422)
      expect(accepted.body.message).toBe('accepted must be a boolean')
      const rationale = await staff.post(url).send({ accepted: true, injected: true }).expect(422)
      expect(rationale.body.message).toBe('rationale is required')
    })
  })

  describe('POST /copyright-notices/:id/restrictions/:restrictionId/reviews', () => {
    it('rejects an unknown key before the service runs', async () => {
      const staff = await createStaff()
      const url = restrictionUrl(crypto.randomUUID(), crypto.randomUUID())

      const rejected = await staff
        .post(url)
        .send({ ...RESTRICTION_REVIEW, injected: true })
        .expect(422)
      expect(rejected.body.message).toBe(INVALID_BODY)

      await staff.post(url).send(RESTRICTION_REVIEW).expect(409)
    })

    it('keeps the field-named parser messages ahead of the schema diagnostic', async () => {
      const staff = await createStaff()
      const url = restrictionUrl(crypto.randomUUID(), crypto.randomUUID())

      const action = await staff
        .post(url)
        .send({ ...RESTRICTION_REVIEW, action: 'lift', injected: true })
        .expect(422)
      expect(action.body.message).toBe('action must be confirm or reverse')
      const rationale = await staff
        .post(url)
        .send({ action: 'confirm', injected: true })
        .expect(422)
      expect(rationale.body.message).toBe('rationale is required')
    })

    it('confirms the restriction for a valid request and records nothing for a rejected one', async () => {
      const { noticeId, restrictionId } = await createRestrictedCase()
      const staff = await createStaff()
      const url = restrictionUrl(noticeId, restrictionId)

      await staff
        .post(url)
        .send({ ...RESTRICTION_REVIEW, injected: true })
        .expect(422)
      const reviewed = await staff.post(url).send(RESTRICTION_REVIEW).expect(200)
      expect(reviewed.body.copyright_restriction).toMatchObject({ id: restrictionId })
    })
  })

  describe('POST /copyright-legal-hold-assessments/:id/resolutions', () => {
    it('rejects an unknown key before the service runs', async () => {
      const staff = await createStaff()
      const url = resolutionUrl(crypto.randomUUID())

      const rejected = await staff
        .post(url)
        .send({ ...RESOLUTION, injected: true })
        .expect(422)
      expect(rejected.body.message).toBe(INVALID_BODY)

      await staff.post(url).send(RESOLUTION).expect(404)
    })

    it('keeps the field-named parser messages ahead of the schema diagnostic', async () => {
      const staff = await createStaff()
      const url = resolutionUrl(crypto.randomUUID())

      const kind = await staff
        .post(url)
        .send({ ...RESOLUTION, resolution_kind: 'abandoned', injected: true })
        .expect(422)
      expect(kind.body.message).toBe('resolution_kind is invalid')
      const missing = await staff
        .post(url)
        .send({ rationale: RATIONALE, injected: true })
        .expect(422)
      expect(missing.body.message).toBe('resolution_kind is required')
    })

    it('resolves the hold for a valid request and records nothing for a rejected one', async () => {
      const { noticeId, targetId } = await createRestrictedCase()
      const staff = await createStaff()
      const holdId = await insertEncryptedCopyrightHoldSubmission(noticeId)
      const assessed = await staff
        .post(`/api/v1/copyright-submissions/${holdId}/legal-hold-assessments`)
        .send({
          rationale: 'Verified qualifying CCB filing.',
          from_original_claimant: true,
          same_material: true,
          proceeding_kind: 'ccb',
          ccb_claim_kind: 'claim',
          commenced_at: '2026-07-01T12:00:00.000Z',
          received_by_designated_agent_at: '2026-07-01T12:30:00.000Z',
          target_ids: [targetId],
        })
        .expect(201)
      const url = resolutionUrl(assessed.body.copyright_legal_hold_assessment.id)

      await staff
        .post(url)
        .send({ ...RESOLUTION, injected: true })
        .expect(422)
      const resolved = await staff.post(url).send(RESOLUTION).expect(201)
      expect(resolved.body.copyright_legal_hold_resolution).toMatchObject({
        copyright_notice_legal_hold_assessment_id: assessed.body.copyright_legal_hold_assessment.id,
        resolution_kind: 'dismissed',
      })
    })
  })
})
