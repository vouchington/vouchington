import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createHash } from 'node:crypto'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from '@services/copyright-notices'
import {
  createCopyrightFormFixture,
  createNotice,
} from '@services/copyright-notices/route-test-fixtures'

describe('copyright notice participant and staff record routes', () => {
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
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('lets only a participant read the private notice projection', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createNotice(fixture)
    const stranger = createRequest()
    await stranger.authenticateAs(await createTestUser())
    await stranger.get(`/api/v1/copyright-notices/${noticeId}/participant`).expect(403)
    const poster = createRequest()
    await poster.authenticateAs(fixture.poster)
    const response = await poster
      .get(`/api/v1/copyright-notices/${noticeId}/participant`)
      .expect(200)
    expect(response.body.copyright_notice).toEqual(
      expect.objectContaining({
        id: noticeId,
        viewer_role: 'poster',
        respondable_target_ids: expect.arrayContaining([expect.any(String)]),
      }),
    )
  })

  it('returns a staff email intake record or 404 when it is missing', async () => {
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId: `ses-staff-intake-${crypto.randomUUID()}`,
      receivedAt: new Date(),
      rawStorageKey: `email/${crypto.randomUUID()}/original.eml`,
      rawSha256: Buffer.alloc(32, 3),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
    })
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: 'claimant@example.test',
      subject: 'Copyright notice',
      bodyText: 'A hosted photograph.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    const moderator = createRequest()
    await moderator.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    expect(
      (await moderator.get(`/api/v1/copyright-email-intakes/${intake.id}`).expect(200)).body
        .copyright_email_intake,
    ).toEqual(expect.objectContaining({ id: intake.id, review_path: 'initial' }))
    await moderator.get(`/api/v1/copyright-email-intakes/${crypto.randomUUID()}`).expect(404)
  })

  it('accepts a bounded similarity-candidate limit from staff', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createNotice(fixture)
    const targetId = await readCopyrightNoticeTargetId(noticeId)
    const moderator = createRequest()
    await moderator.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    expect(
      (
        await moderator
          .get(
            `/api/v1/copyright-notices/${noticeId}/targets/${targetId}/image-similarity-candidates?limit=10`,
          )
          .expect(200)
      ).body,
    ).toEqual({ availability: 'unavailable', copyright_image_similarity_candidates: [] })
  })
})
