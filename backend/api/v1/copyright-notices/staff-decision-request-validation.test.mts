import { createCopyrightApiUnreviewedCase } from '@voucha/test-helpers/copyright-api-review-fixtures'
import { assertCopyrightApiConfirmation } from '@voucha/test-helpers/copyright-api-confirmation-outcomes'
import { assertCopyrightApiHoldResolution } from '@voucha/test-helpers/copyright-api-hold-outcomes'
import { seedEvidenceHold } from '@voucha/test-helpers/copyright-evidence-hold-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertEncryptedCopyrightHoldSubmission } from '@voucha/test-helpers/data-stores/psql/copyright-hold-submission'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

const INVALID_BODY = 'Invalid request body'
const RATIONALE = 'The staff decision stands after review.'
const FORM_REVIEW = { is_accepted: true, rationale: RATIONALE }
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

async function createStaff(user?: Awaited<ReturnType<typeof createTestUser>>) {
  const staff = createRequest()
  await staff.authenticateAs(user ?? (await createTestUser({ extraRoles: ['moderator'] })))
  return staff
}

describe('copyright staff decision request contracts', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()

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
        expect(anonymous.body.message).not.toMatch(/schema|must be|required|invalid/i)
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

    it.each(['null', '[]', '5'])('answers 422, not 500, for the JSON body %s', async raw => {
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
        .send({ ...FORM_REVIEW, is_accepted: 'yes', injected: true })
        .expect(422)
      expect(accepted.body.message).toBe('is_accepted must be a boolean')
      const rationale = await staff
        .post(url)
        .send({ is_accepted: true, injected: true })
        .expect(422)
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
      const fixture = await createCopyrightApiUnreviewedCase()
      const { noticeId, restrictionId } = fixture
      const staff = await createStaff(fixture.moderator)
      const url = restrictionUrl(noticeId, restrictionId)
      const before = await getCopyrightNoticePrivateAggregate(noticeId)
      await staff
        .post(url)
        .send({ ...RESTRICTION_REVIEW, injected: true })
        .expect(422)
      expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(before)
      await assertCopyrightApiConfirmation(staff, fixture, url, RESTRICTION_REVIEW)
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
      const fixture = await createCopyrightApiUnreviewedCase()
      const { noticeId, targetId } = fixture
      const staff = await createStaff(fixture.moderator)
      const holdId = await insertEncryptedCopyrightHoldSubmission(noticeId)
      const assessed = await seedEvidenceHold({
        noticeId,
        currentUser: fixture.moderator,
        submissionId: holdId,
        assessedAt: new Date(),
        fromOriginalClaimant: true,
        sameMaterial: true,
        proceedingKind: 'ccb',
        ccbClaimKind: 'claim',
        commencedAt: new Date('2026-07-01T12:00:00.000Z'),
        receivedByDesignatedAgentAt: new Date('2026-07-01T12:30:00.000Z'),
        targetIds: [targetId],
        rationale: 'Verified qualifying CCB filing.',
      })
      const url = resolutionUrl(assessed.id)
      const before = await getCopyrightNoticePrivateAggregate(noticeId)
      await staff
        .post(url)
        .send({ ...RESOLUTION, injected: true })
        .expect(422)
      expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(before)
      await assertCopyrightApiHoldResolution({
        staff,
        noticeId,
        assessmentId: assessed.id,
        reviewerId: fixture.moderator.id,
        body: RESOLUTION,
      })
    })
  })
})
