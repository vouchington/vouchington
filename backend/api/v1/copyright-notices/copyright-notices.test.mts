import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { addUserRole } from '@services/users/roles-permissions'
import { createCopyrightFormIntake } from '@services/copyright-notices'
import {
  counterNoticeBody,
  createCopyrightFormFixture,
  createNotice,
} from '@services/copyright-notices/route-test-fixtures'

describe('copyright notice routes', () => {
  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.stubEnv('SES_COPYRIGHT_SOURCE_EMAIL', 'copyright@voucha.ai')
    vi.stubEnv('SES_COPYRIGHT_REPLY_TO', 'copyright@voucha.ai')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('rejects a form intake without CAPTCHA verification', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    expect(
      (await createRequest().post('/api/v1/copyright-notices').send({}).expect(422)).body.message,
    ).toContain('CAPTCHA token is required')
  })
  it('accepts an authenticated structured form exactly once for an idempotency key', async () => {
    const fixture = await createCopyrightFormFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.claimant)
    const key = crypto.randomUUID()
    const first = await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', key)
      .send(fixture.form)
      .expect(202)
    const replay = await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', key)
      .send(fixture.form)
      .expect(200)
    expect(first.body).toEqual({
      copyright_notice: { id: expect.any(String) },
      is_duplicate: false,
    })
    expect(replay.body).toEqual({
      copyright_notice: { id: first.body.copyright_notice.id },
      is_duplicate: true,
    })
  })
  it('requires an idempotency key before accepting an authenticated form', async () => {
    const fixture = await createCopyrightFormFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.claimant)

    await request.post('/api/v1/copyright-notices').send(fixture.form).expect(400)
  })
  it('rejects anonymous appeals and counter-notices', async () => {
    const noticeId = await createNotice(await createCopyrightFormFixture())
    await createRequest().post(`/api/v1/copyright-notices/${noticeId}/appeals`).send({}).expect(401)
    await createRequest()
      .post(`/api/v1/copyright-notices/${noticeId}/counter-notices`)
      .send({})
      .expect(401)
  })
  it('requires sign-in for accepted-case records and does not reveal unaccepted notices', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createNotice(fixture)
    await createRequest().get('/api/v1/copyright-notices').expect(401)
    await createRequest().get(`/api/v1/copyright-notices/${noticeId}`).expect(401)
    const request = createRequest()
    await request.authenticateAs(await createTestUser())
    await request.get(`/api/v1/copyright-notices/${noticeId}`).expect(404)
  })
  it('only lets copyright-review staff read advisory image similarity candidates', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createNotice(fixture)
    const targetId = await readCopyrightNoticeTargetId(noticeId)
    const claimant = createRequest()
    await claimant.authenticateAs(fixture.claimant)
    await claimant
      .get(`/api/v1/copyright-notices/${noticeId}/targets/${targetId}/image-similarity-candidates`)
      .expect(403)
    const moderator = createRequest()
    await moderator.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    expect(
      (
        await moderator
          .get(
            `/api/v1/copyright-notices/${noticeId}/targets/${targetId}/image-similarity-candidates`,
          )
          .expect(200)
      ).body,
    ).toEqual({ availability: 'unavailable', copyright_image_similarity_candidates: [] })
  })
  it('returns a staff-only pending case aggregate instead of blind review IDs', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createNotice(fixture)
    const moderator = createRequest()
    await moderator.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))

    const response = await moderator.get('/api/v1/copyright-notices/review-queue').expect(200)
    expect(response.body.copyright_notices).toContainEqual(
      expect.objectContaining({
        id: noticeId,
        claimant: expect.objectContaining({ contact: fixture.form.claimant_contact }),
        work_description: fixture.form.work_description,
        targets: expect.arrayContaining([
          expect.objectContaining({ hosted_use_url: expect.any(String) }),
        ]),
        form_review: expect.objectContaining({ source_kind: 'signed_in_form' }),
        evidence: expect.any(Array),
        restrictions: expect.any(Array),
        appeals: expect.any(Array),
        counter_notices: expect.any(Array),
      }),
    )
  })
  it('does not allow a suspended review moderator to read private copyright queues or email records', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    await suspendTestUser(moderator.id)
    const request = createRequest()
    await request.authenticateAs(moderator)

    await request.get('/api/v1/copyright-notices/review-queue').expect(403)
    await request.get('/api/v1/copyright-email-intakes/review-queue').expect(403)
    await request.get(`/api/v1/copyright-email-intakes/${crypto.randomUUID()}`).expect(403)
  })
  it('only lets the affected poster submit an appeal or counter-notice', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createNotice(fixture)
    const targetId = await readCopyrightNoticeTargetId(noticeId)
    const other = createRequest()
    await other.authenticateAs(await createTestUser())
    await other
      .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'This does not belong to me.', target_ids: [targetId] })
      .expect(403)
    await other
      .post(`/api/v1/copyright-notices/${noticeId}/counter-notices`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(counterNoticeBody(targetId))
      .expect(403)
    const poster = createRequest()
    await poster.authenticateAs(fixture.poster)
    const key = crypto.randomUUID()
    const appeal = await poster
      .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
      .set('Idempotency-Key', key)
      .send({ reason: 'This is my hosted material.', target_ids: [targetId] })
      .expect(201)
    expect(
      (
        await poster
          .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
          .set('Idempotency-Key', key)
          .send({ reason: 'This is my hosted material.', target_ids: [targetId] })
          .expect(200)
      ).body,
    ).toEqual({
      copyright_submission: { id: appeal.body.copyright_submission.id },
      is_duplicate: true,
    })
  })
  it('authorizes a moderator and validates each copyright-review request before loading its record', async () => {
    const moderator = await createTestUser()
    await addUserRole(moderator.id, 'moderator')
    const request = createRequest()
    await request.authenticateAs(moderator)
    const missingId = crypto.randomUUID()
    const restrictionId = crypto.randomUUID()
    const fixture = await createCopyrightFormFixture()

    await request
      .post(`/api/v1/copyright-notices/${missingId}/restrictions/${restrictionId}/reviews`)
      .send({ action: 'confirm', rationale: 'The restriction remains appropriate.' })
      .expect(409)
    await request
      .post(`/api/v1/copyright-form-intakes/${missingId}/reviews`)
      .send({ accepted: true, rationale: 'The structured notice is complete.' })
      .expect(404)
    const guestTarget = fixture.form.targets[0]!
    const guestIntake = await createCopyrightFormIntake({
      requesterUserId: null,
      requesterIdentity: `guest:${crypto.randomUUID()}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Guest claimant',
        claimantContact: 'guest@example.test',
        claimantEmail: 'guest@example.test',
        workDescription: 'A photograph owned by the guest claimant.',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Guest claimant',
        claimantTargets: [
          {
            postId: guestTarget.post_id,
            imageId: guestTarget.image_id,
            hostedUseUrl: guestTarget.target_url,
          },
        ],
      },
    })
    await request
      .post(`/api/v1/copyright-form-intakes/${guestIntake.intake.id}/reviews`)
      .send({ accepted: true, rationale: 'The structured notice is complete.' })
      .expect(200)
    await request
      .post(`/api/v1/copyright-email-intakes/${missingId}/rejections`)
      .send({
        rationale: 'The message is unrelated to copyright.',
        response_kind: 'rejected',
        response_message: 'This mailbox only accepts copyright notices.',
      })
      .expect(422)
    await request
      .post(`/api/v1/copyright-email-intakes/${missingId}/approvals`)
      .send({
        rationale: 'The message supplies a complete notice.',
        ...fixture.form,
      })
      .expect(422)
    await request
      .post(`/api/v1/copyright-submissions/${missingId}/appeal-reviews`)
      .send({
        rationale: 'The appeal does not warrant reversal.',
        manual_fallback_reason: 'No recommendation is available.',
        decisions: [{ restriction_id: restrictionId, action: 'confirm' }],
      })
      .expect(404)
    await request
      .post(`/api/v1/copyright-submissions/${missingId}/counter-notice-reviews`)
      .send({ accepted: false, rationale: 'The counter-notice is incomplete.' })
      .expect(404)
    await request
      .post(`/api/v1/copyright-email-intakes/${missingId}/correspondence`)
      .send({
        kind: 'supplement',
        rationale: 'The email supplements an existing record.',
        manual_fallback_reason: 'No recommendation is available.',
        submission_summary: 'Additional hosted-use information.',
      })
      .expect(404)
    await request
      .post(`/api/v1/copyright-email-intakes/${missingId}/correspondence`)
      .send({
        kind: 'appeal',
        rationale: 'The email appeals a restriction.',
        manual_fallback_reason: 'No recommendation is available.',
        appeal_reason: 'The poster owns the material.',
        target_ids: [crypto.randomUUID()],
      })
      .expect(404)
    await request
      .post(`/api/v1/copyright-email-intakes/${missingId}/correspondence`)
      .send({
        kind: 'counter_notice',
        rationale: 'The email contains a counter-notice.',
        manual_fallback_reason: 'No recommendation is available.',
        name: 'Poster',
        address: '1 Main Street',
        telephone: '555-0100',
        consent_to_federal_jurisdiction: true,
        consent_to_service_of_process: true,
        good_faith_misidentification_under_penalty_of_perjury: true,
        electronic_signature: 'Poster',
        target_ids: [crypto.randomUUID()],
      })
      .expect(404)
    await request
      .post(`/api/v1/copyright-email-intakes/${missingId}/correspondence-rejections`)
      .send({
        kind: 'withdrawal',
        rationale: 'The email cannot be associated with a notice.',
        manual_fallback_reason: 'No recommendation is available.',
      })
      .expect(404)
  })
})
