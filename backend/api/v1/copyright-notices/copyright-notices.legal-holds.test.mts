import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { markTestCopyrightDeliveryIntentFailed } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { addUserRole } from '@services/users/roles-permissions'
import {
  appendCopyrightNoticeSubmission,
  createCopyrightDeliveryIntent,
} from '@services/copyright-notices'
import { createCopyrightRestorationHoldFixture } from '@services/copyright-notices/evidence-and-holds-restoration-hold-fixtures'

describe('copyright legal-hold and delivery-replay routes', () => {
  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('lets copyright-review staff record and resolve a qualifying legal hold', async () => {
    const { aggregate, moderator, notice } = await createCopyrightRestorationHoldFixture()
    await addUserRole(moderator.id, 'moderator')
    const submission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-03T12:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)
    const created = await request
      .post(`/api/v1/copyright-submissions/${submission.id}/legal-hold-assessments`)
      .send({
        rationale: 'Verified qualifying federal court filing.',
        from_original_claimant: true,
        same_material: true,
        proceeding_kind: 'federal_court',
        commenced_at: '2026-07-03T11:00:00.000Z',
        received_by_designated_agent_at: '2026-07-03T12:00:00.000Z',
        target_ids: [aggregate.targets[0]!.id],
      })
      .expect(201)
    const assessmentId = created.body.copyright_legal_hold_assessment.id as string
    expect(created.body.copyright_legal_hold_assessment).toEqual(
      expect.objectContaining({
        proceeding_kind: 'federal_court',
        from_original_claimant: true,
        same_material: true,
      }),
    )
    expect(
      (
        await request
          .post(`/api/v1/copyright-legal-hold-assessments/${assessmentId}/resolutions`)
          .send({
            rationale: 'The proceeding was dismissed.',
            resolution_kind: 'dismissed',
          })
          .expect(201)
      ).body.copyright_legal_hold_resolution,
    ).toEqual(expect.objectContaining({ resolution_kind: 'dismissed' }))
  })

  it('replays a failed delivery intent only for copyright-review staff', async () => {
    const { claimant, moderator, notice } = await createCopyrightRestorationHoldFixture()
    await addUserRole(moderator.id, 'moderator')
    const intent = await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: null,
      correspondenceId: null,
      recipientUserId: claimant.id,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'in_app',
      idempotencyKey: `copyright-delivery-replay-${crypto.randomUUID()}`,
    })
    await markTestCopyrightDeliveryIntentFailed(intent.id)
    const nonModerator = createRequest()
    await nonModerator.authenticateAs(await createTestUser())
    await nonModerator
      .post(`/api/v1/copyright-notices/${notice.id}/delivery-intents/${intent.id}/replays`)
      .expect(403)
    const request = createRequest()
    await request.authenticateAs(moderator)
    expect(
      (
        await request
          .post(`/api/v1/copyright-notices/${notice.id}/delivery-intents/${intent.id}/replays`)
          .expect(200)
      ).body,
    ).toEqual({ replayed: true })
    expect(
      (
        await request
          .post(`/api/v1/copyright-notices/${notice.id}/delivery-intents/${intent.id}/replays`)
          .expect(200)
      ).body,
    ).toEqual({ replayed: false })
  })
})
