import { createCopyrightApiUnreviewedCase } from '@voucha/test-helpers/copyright-api-review-fixtures'
import { assertCopyrightApiConfirmation } from '@voucha/test-helpers/copyright-api-confirmation-outcomes'
import { assertCopyrightApiHoldAssessment } from '@voucha/test-helpers/copyright-api-hold-outcomes'
import { assertCopyrightApiCounterRejection } from '@voucha/test-helpers/copyright-api-counter-review-outcome'
import { seedEffectiveReviewAppeal } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { seedRestorationCounterNotice } from '@voucha/test-helpers/copyright-restoration-counter-notice-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertEncryptedCopyrightHoldSubmission } from '@voucha/test-helpers/data-stores/psql/copyright-hold-submission'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

const SUBMISSIONS = '/api/v1/copyright-submissions'
const INVALID_BODY = 'Invalid request body'
const ROUTES = ['appeal-reviews', 'counter-notice-reviews', 'legal-hold-assessments']
const FALLBACK = 'No recommendation is available.'

async function createStaff(user?: Awaited<ReturnType<typeof createTestUser>>) {
  const staff = createRequest()
  await staff.authenticateAs(user ?? (await createTestUser({ extraRoles: ['moderator'] })))
  return staff
}

function appealReview(restrictionId: string) {
  return {
    rationale: 'The appeal does not warrant reversal.',
    manual_fallback_reason: FALLBACK,
    decisions: [{ restriction_id: restrictionId, action: 'confirm' }],
  }
}

const counterReview = { is_accepted: false, rationale: 'The counter-notice is incomplete.' }

function legalHold(targetId: string) {
  return {
    rationale: 'Verified qualifying CCB filing.',
    is_from_original_claimant: true,
    is_same_material: true,
    proceeding_kind: 'ccb',
    ccb_claim_kind: 'claim',
    commenced_at: '2026-07-01T12:00:00.000Z',
    received_by_designated_agent_at: '2026-07-01T12:30:00.000Z',
    target_ids: [targetId],
  }
}

describe('copyright submission review request contracts', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('authentication and path', () => {
    it.each(ROUTES)(
      'keeps a bare 401 and 403 on %s ahead of any schema diagnostic',
      async route => {
        const url = `${SUBMISSIONS}/${crypto.randomUUID()}/${route}`
        const anonymous = await createRequest().post(url).send({ injected: true }).expect(401)
        expect(anonymous.body.message).not.toMatch(/schema|must be|required|invalid/i)
        const member = createRequest()
        await member.authenticateAs(await createTestUser())
        await member.post(url).send({ injected: true }).expect(403)
      },
    )

    it('keeps a bare 401 and 403 on the media-delivery replay, which has no request carriers', async () => {
      const url = '/api/v1/copyright-media-delivery/replays'
      await createRequest().post(url).expect(401)
      const member = createRequest()
      await member.authenticateAs(await createTestUser())
      await member.post(url).expect(403)
    })

    it.each(ROUTES)('rejects a malformed submission id on %s', async route => {
      const staff = await createStaff()
      await staff.post(`${SUBMISSIONS}/not-a-uuid/${route}`).send({}).expect(422)
    })
  })

  describe('POST /copyright-submissions/:id/appeal-reviews', () => {
    // An unknown submission is the service's 404, so a 422 here means the request never reached it.
    it('rejects an unknown key before the service runs', async () => {
      const staff = await createStaff()
      const url = `${SUBMISSIONS}/${crypto.randomUUID()}/appeal-reviews`
      const body = appealReview(crypto.randomUUID())
      const [decision] = body.decisions

      const topLevel = await staff
        .post(url)
        .send({ ...body, injected: true })
        .expect(422)
      expect(topLevel.body.message).toBe(INVALID_BODY)
      const nested = await staff
        .post(url)
        .send({ ...body, decisions: [{ ...decision!, injected: true }] })
        .expect(422)
      expect(nested.body.message).toBe(INVALID_BODY)

      await staff.post(url).send(body).expect(404)
    })

    it('keeps the field-named parser messages ahead of the schema diagnostic', async () => {
      const staff = await createStaff()
      const url = `${SUBMISSIONS}/${crypto.randomUUID()}/appeal-reviews`
      const body = { ...appealReview(crypto.randomUUID()), injected: true }

      const none = await staff
        .post(url)
        .send({ ...body, decisions: [] })
        .expect(422)
      expect(none.body.message).toBe('decisions are required')
      const restriction = await staff
        .post(url)
        .send({ ...body, decisions: [{ restriction_id: 'nope', action: 'confirm' }] })
        .expect(422)
      expect(restriction.body.message).toBe('restriction_id must be a UUID')
      const action = await staff
        .post(url)
        .send({ ...body, decisions: [{ restriction_id: crypto.randomUUID(), action: 'lift' }] })
        .expect(422)
      expect(action.body.message).toBe('action must be confirm or reverse')
      const recommendation = await staff
        .post(url)
        .send({ ...body, recommendation_id: 'nope' })
        .expect(422)
      expect(recommendation.body.message).toBe('recommendation_id must be a UUID or null')
    })

    it('confirms the restriction for a valid request and records nothing for a rejected one', async () => {
      const fixture = await createCopyrightApiUnreviewedCase()
      const { noticeId, restrictionId, targetId } = fixture
      const appeal = await seedEffectiveReviewAppeal(noticeId, fixture.poster.id, targetId)
      const staff = await createStaff(fixture.moderator)
      const url = `${SUBMISSIONS}/${appeal.submission.id}/appeal-reviews`
      const before = await getCopyrightNoticePrivateAggregate(noticeId)
      await staff
        .post(url)
        .send({ ...appealReview(restrictionId), injected: true })
        .expect(422)
      expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(before)
      await assertCopyrightApiConfirmation(
        staff,
        fixture,
        url,
        appealReview(restrictionId),
        appeal.submission.id,
      )
    })
  })

  describe('POST /copyright-submissions/:id/counter-notice-reviews', () => {
    it('rejects an unknown key, including keys only the appeal review reads', async () => {
      const staff = await createStaff()
      const url = `${SUBMISSIONS}/${crypto.randomUUID()}/counter-notice-reviews`

      for (const extra of [
        { injected: true },
        { recommendation_id: crypto.randomUUID() },
        { manual_fallback_reason: FALLBACK },
      ]) {
        const rejected = await staff
          .post(url)
          .send({ ...counterReview, ...extra })
          .expect(422)
        expect(rejected.body.message).toBe(INVALID_BODY)
      }

      await staff.post(url).send(counterReview).expect(404)
    })

    it('keeps the field-named parser messages ahead of the schema diagnostic', async () => {
      const staff = await createStaff()
      const url = `${SUBMISSIONS}/${crypto.randomUUID()}/counter-notice-reviews`

      const accepted = await staff
        .post(url)
        .send({ ...counterReview, is_accepted: 'yes', injected: true })
        .expect(422)
      expect(accepted.body.message).toBe('is_accepted must be a boolean')
    })

    it('reviews a counter-notice for a valid request and records nothing for a rejected one', async () => {
      const fixture = await createCopyrightApiUnreviewedCase()
      const { noticeId, targetId } = fixture
      const counter = await seedRestorationCounterNotice(fixture.poster, noticeId, [targetId])
      const staff = await createStaff(fixture.moderator)
      const url = `${SUBMISSIONS}/${counter.submission.id}/counter-notice-reviews`
      const before = await getCopyrightNoticePrivateAggregate(noticeId)
      await staff
        .post(url)
        .send({ ...counterReview, injected: true })
        .expect(422)
      expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(before)
      await assertCopyrightApiCounterRejection({
        staff,
        noticeId,
        submissionId: counter.submission.id,
        reviewerId: fixture.moderator.id,
        posterId: fixture.poster.id,
        body: counterReview,
      })
    })
  })

  describe('POST /copyright-submissions/:id/legal-hold-assessments', () => {
    it('rejects an unknown key before the service runs', async () => {
      const staff = await createStaff()
      const url = `${SUBMISSIONS}/${crypto.randomUUID()}/legal-hold-assessments`
      const body = legalHold(crypto.randomUUID())

      const rejected = await staff
        .post(url)
        .send({ ...body, injected: true })
        .expect(422)
      expect(rejected.body.message).toBe(INVALID_BODY)

      await staff.post(url).send(body).expect(404)
    })

    it('keeps the field-named parser messages ahead of the schema diagnostic', async () => {
      const staff = await createStaff()
      const url = `${SUBMISSIONS}/${crypto.randomUUID()}/legal-hold-assessments`
      const body = { ...legalHold(crypto.randomUUID()), injected: true }

      const kind = await staff
        .post(url)
        .send({ ...body, proceeding_kind: 'tribunal' })
        .expect(422)
      expect(kind.body.message).toBe('proceeding_kind is invalid')
      const same = await staff
        .post(url)
        .send({ ...body, is_same_material: 'yes' })
        .expect(422)
      expect(same.body.message).toBe('is_same_material is required')
      const targets = await staff
        .post(url)
        .send({ ...body, target_ids: ['nope'] })
        .expect(422)
      expect(targets.body.message).toBe('target_ids must be UUIDs')
    })

    it('records the assessment for a valid request and nothing for a rejected one', async () => {
      const fixture = await createCopyrightApiUnreviewedCase()
      const { noticeId, targetId } = fixture
      const staff = await createStaff(fixture.moderator)
      // The helper encrypts the statement, so the staff queue can still read this case.
      const holdId = await insertEncryptedCopyrightHoldSubmission(noticeId)
      const url = `${SUBMISSIONS}/${holdId}/legal-hold-assessments`

      const before = await getCopyrightNoticePrivateAggregate(noticeId)
      await staff
        .post(url)
        .send({ ...legalHold(targetId), injected: true })
        .expect(422)
      await staff
        .post(url)
        .send({ ...legalHold(targetId), target_ids: [targetId, targetId] })
        .expect(422)

      expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(before)
      await assertCopyrightApiHoldAssessment({
        staff,
        noticeId,
        submissionId: holdId,
        reviewerId: fixture.moderator.id,
        body: legalHold(targetId),
      })
    })
  })
})
