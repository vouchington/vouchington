import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { counterNoticeBody } from '@voucha/test-helpers/copyright-route-fixtures'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertEncryptedCopyrightHoldSubmission } from '@voucha/test-helpers/data-stores/psql/copyright-hold-submission'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createRetentionSignedInForm } from '@voucha/test-helpers/services/copyright-notices/retention-signed-in-form'

const SUBMISSIONS = '/api/v1/copyright-submissions'
const INVALID_BODY = 'Invalid request body'
const ROUTES = ['appeal-reviews', 'counter-notice-reviews', 'legal-hold-assessments']
const FALLBACK = 'No recommendation is available.'

async function createStaff() {
  const staff = createRequest()
  await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return staff
}

/** A restricted notice whose poster is signed in, plus the ids a review decision names. */
async function createRestrictedCase() {
  const poster = await createTestUser()
  const { copyright_notice_id: noticeId } = await createRetentionSignedInForm(poster.id)
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const restrictionId = aggregate?.restrictions[0]?.id
  if (!restrictionId) throw new Error('fixture restriction missing')
  const posterRequest = createRequest()
  await posterRequest.authenticateAs(poster)
  return {
    noticeId,
    restrictionId,
    posterRequest,
    targetId: await readCopyrightNoticeTargetId(noticeId),
  }
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

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('authentication and path', () => {
    it.each(ROUTES)(
      'keeps a bare 401 and 403 on %s ahead of any schema diagnostic',
      async route => {
        const url = `${SUBMISSIONS}/${crypto.randomUUID()}/${route}`
        const anonymous = await createRequest().post(url).send({ injected: true }).expect(401)
        expect(anonymous.text).not.toMatch(/schema|must be|required|invalid/i)
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
      const { noticeId, restrictionId, targetId, posterRequest } = await createRestrictedCase()
      const appeal = await posterRequest
        .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ reason: 'This is my hosted material.', target_ids: [targetId] })
        .expect(201)
      const staff = await createStaff()
      const url = `${SUBMISSIONS}/${appeal.body.copyright_submission.id}/appeal-reviews`

      await staff
        .post(url)
        .send({ ...appealReview(restrictionId), injected: true })
        .expect(422)
      expect((await getCopyrightNoticePrivateAggregate(noticeId))?.appealReviews).toEqual([])

      const reviewed = await staff.post(url).send(appealReview(restrictionId)).expect(200)
      expect(reviewed.body.copyright_notice).toEqual({ id: noticeId })
      expect(reviewed.body.review_ids).toHaveLength(1)
      expect((await getCopyrightNoticePrivateAggregate(noticeId))?.appealReviews).toHaveLength(1)
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
      const { noticeId, targetId, posterRequest } = await createRestrictedCase()
      const counter = await posterRequest
        .post(`/api/v1/copyright-notices/${noticeId}/counter-notices`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send(counterNoticeBody(targetId))
        .expect(201)
      const staff = await createStaff()
      const url = `${SUBMISSIONS}/${counter.body.copyright_submission.id}/counter-notice-reviews`

      await staff
        .post(url)
        .send({ ...counterReview, injected: true })
        .expect(422)
      expect((await getCopyrightNoticePrivateAggregate(noticeId))?.counterNoticeReviews).toEqual([])

      const reviewed = await staff.post(url).send(counterReview).expect(200)
      expect(reviewed.body.copyright_notice).toEqual({ id: noticeId })
      expect(
        (await getCopyrightNoticePrivateAggregate(noticeId))?.counterNoticeReviews,
      ).toHaveLength(1)
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
      const { noticeId, targetId } = await createRestrictedCase()
      const staff = await createStaff()
      // The helper encrypts the statement, so the staff queue can still read this case.
      const holdId = await insertEncryptedCopyrightHoldSubmission(noticeId)
      const url = `${SUBMISSIONS}/${holdId}/legal-hold-assessments`

      await staff
        .post(url)
        .send({ ...legalHold(targetId), injected: true })
        .expect(422)
      await staff
        .post(url)
        .send({ ...legalHold(targetId), target_ids: [targetId, targetId] })
        .expect(422)

      const created = await staff.post(url).send(legalHold(targetId)).expect(201)
      expect(created.body.copyright_legal_hold_assessment).toMatchObject({
        copyright_notice_submission_id: holdId,
        target_ids: [targetId],
      })
    })
  })
})
