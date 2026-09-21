import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  createCopyrightDeliveryIntent,
  createCopyrightNoticeAggregate,
  createOutboundCopyrightCorrespondence,
  getCopyrightNoticePrivateAggregate,
} from '@services/copyright-notices'
import { failTestCopyrightDeliveryIntent } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'

describe('copyright staff and participant routes', () => {
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

  it('returns the accepted case to the claimant and forbids unrelated viewers', async () => {
    const fixture = await createAcceptedNoticeFixture()
    await createRequest()
      .get(`/api/v1/copyright-notices/${fixture.noticeId}/participant`)
      .expect(401)
    const stranger = createRequest()
    await stranger.authenticateAs(await createTestUser())
    await stranger.get(`/api/v1/copyright-notices/${fixture.noticeId}/participant`).expect(403)
    const claimant = createRequest()
    await claimant.authenticateAs(fixture.claimant)
    const response = await claimant
      .get(`/api/v1/copyright-notices/${fixture.noticeId}/participant`)
      .expect(200)
    expect(response.body.copyright_notice).toMatchObject({
      id: fixture.noticeId,
      viewer_role: 'claimant',
    })
  })

  it('returns 404 for a missing staff email intake and replays a failed delivery intent', async () => {
    const fixture = await createAcceptedNoticeFixture()
    const moderator = createRequest()
    await moderator.authenticateAs(fixture.moderator)
    await moderator.get(`/api/v1/copyright-email-intakes/${crypto.randomUUID()}`).expect(404)
    await moderator.get('/api/v1/copyright-email-intakes/review-queue').expect(200)
    const missingReplay = await moderator
      .post(
        `/api/v1/copyright-notices/${fixture.noticeId}/delivery-intents/${crypto.randomUUID()}/replays`,
      )
      .expect(200)
    expect(missingReplay.body).toEqual({ replayed: false })
    await failTestCopyrightDeliveryIntent(fixture.deliveryIntentId)
    const replay = await moderator
      .post(
        `/api/v1/copyright-notices/${fixture.noticeId}/delivery-intents/${fixture.deliveryIntentId}/replays`,
      )
      .expect(200)
    expect(replay.body).toEqual({ replayed: true })
  })

  it('records and resolves a qualifying CCB legal hold from staff HTTP', async () => {
    const fixture = await createAcceptedNoticeFixture()
    const holdSubmission = await appendCopyrightNoticeSubmission({
      noticeId: fixture.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-01T13:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const moderator = createRequest()
    await moderator.authenticateAs(fixture.moderator)
    const created = await moderator
      .post(`/api/v1/copyright-submissions/${holdSubmission.id}/legal-hold-assessments`)
      .send({
        rationale: 'Verified qualifying CCB filing.',
        from_original_claimant: true,
        same_material: true,
        proceeding_kind: 'ccb',
        ccb_claim_kind: 'claim',
        commenced_at: '2026-07-01T12:00:00.000Z',
        received_by_designated_agent_at: '2026-07-01T12:30:00.000Z',
        target_ids: [fixture.targetId],
      })
      .expect(201)
    expect(created.body.copyright_legal_hold_assessment).toMatchObject({
      copyright_notice_submission_id: holdSubmission.id,
      proceeding_kind: 'ccb',
      ccb_claim_kind: 'claim',
      target_ids: [fixture.targetId],
    })
    const resolved = await moderator
      .post(
        `/api/v1/copyright-legal-hold-assessments/${created.body.copyright_legal_hold_assessment.id}/resolutions`,
      )
      .send({
        rationale: 'The CCB claim was dismissed.',
        resolution_kind: 'dismissed',
      })
      .expect(201)
    expect(resolved.body.copyright_legal_hold_resolution).toMatchObject({
      copyright_notice_legal_hold_assessment_id: created.body.copyright_legal_hold_assessment.id,
      resolution_kind: 'dismissed',
    })
  })
})

async function createAcceptedNoticeFixture() {
  const [claimant, moderator] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const [postId, imageId] = await Promise.all([
    insertTestPost({
      title: `Copyright staff route ${crypto.randomUUID()}`,
      slug: `copyright-staff-route-${crypto.randomUUID()}`,
      createdById: claimant.id,
      markdown: 'Hosted image for a copyright staff route test.',
    }),
    insertTestImage(claimant.id),
  ])
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('staff route placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-07-01T11:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: 'Staff route claimant',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'staff', bodyCiphertext: 'notice' },
    targets: [
      {
        placementKey: `image-placement:${placement.placement_id}`,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate?.submissions[0] || !aggregate.targets[0])
    throw new Error('staff route notice disappeared')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:30:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0].id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: moderator.id,
  })
  const receipt = await createOutboundCopyrightCorrespondence({
    noticeId: notice.id,
    submissionId: aggregate.submissions[0].id,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  const delivery = await createCopyrightDeliveryIntent({
    noticeId: notice.id,
    submissionId: aggregate.submissions[0].id,
    correspondenceId: receipt.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `copyright-staff-receipt-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
  })
  return {
    claimant,
    moderator,
    noticeId: notice.id,
    targetId: aggregate.targets[0].id,
    deliveryIntentId: delivery.id,
  }
}
