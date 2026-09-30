import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  countCopyrightActiveRestrictionsForNotice,
  readCopyrightStaffQueueCursorBefore,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  enableAutomaticProvisionalWithholdingForTest,
  useAutomaticProvisionalWithholding,
} from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  appendCopyrightSubmissionAssessment,
  applyNonSpamSignedInCopyrightFormScreening,
  getCopyrightNoticePrivateAggregate,
  processCopyrightEnforcementRequest,
  searchReconcilableCopyrightEnforcementRequestIds,
} from '@services/copyright-notices'

type StaffRequest = ReturnType<typeof createRequest>

async function createStaffRequest(): Promise<StaffRequest> {
  const request = createRequest()
  await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return request
}

async function isListedInReviewQueue(request: StaffRequest, noticeId: string): Promise<boolean> {
  let after = await readCopyrightStaffQueueCursorBefore([noticeId])
  for (;;) {
    const page = await request
      .get(`/api/v1/copyright-notices/review-queue?limit=100&after=${encodeURIComponent(after)}`)
      .expect(200)
    const ids = page.body.copyright_notices.map((notice: { id: string }) => notice.id)
    if (ids.includes(noticeId)) return true
    if (!page.body.page_info.has_next_page || !page.body.page_info.end_cursor) return false
    after = page.body.page_info.end_cursor
  }
}

function reviewFormIntake(request: StaffRequest, intakeId: string) {
  return request
    .post(`/api/v1/copyright-form-intakes/${intakeId}/reviews`)
    .send({ accepted: true, rationale: 'The signed notice is complete.' })
}

describe('moderator-first copyright withholding', () => {
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

  it('leaves a clear-screened intake unassessed, unrestricted and queued while the switch is off', async () => {
    const [{ notice }, staff] = await Promise.all([createClearScreenedForm(), createStaffRequest()])

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments).toEqual([])
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
    await expect(isListedInReviewQueue(staff, notice.intake.copyright_notice_id)).resolves.toBe(
      true,
    )
  })

  it('keeps an automated request from before the switch-off pending and queued until a moderator accepts', async () => {
    const restoreSwitch = await enableAutomaticProvisionalWithholdingForTest()
    const [{ notice, screeningId }, staff] = await Promise.all([
      createClearScreenedForm(),
      createStaffRequest(),
    ])
    const automated = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    restoreSwitch()

    await expect(processCopyrightEnforcementRequest(automated.id)).resolves.toBe('not_claimed')
    await expect(
      readTestOwnedCopyrightSweepIds(
        searchReconcilableCopyrightEnforcementRequestIds,
        automated.id,
      ),
    ).resolves.toEqual([automated.id])
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
    await expect(isListedInReviewQueue(staff, notice.intake.copyright_notice_id)).resolves.toBe(
      true,
    )

    await reviewFormIntake(staff, notice.intake.id).expect(200)
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
    await expect(processCopyrightEnforcementRequest(automated.id)).resolves.toBe('completed')
  })

  it('withholds when a moderator accepts a clear-screened signed-in intake', async () => {
    const [{ notice }, staff] = await Promise.all([createClearScreenedForm(), createStaffRequest()])

    const response = await reviewFormIntake(staff, notice.intake.id).expect(200)

    expect(response.body).toMatchObject({ accepted: true })
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments).toEqual([
      expect.objectContaining({
        copyright_notice_form_screening_id: null,
        substantially_compliant: true,
      }),
    ])
  })

  describe('with automatic provisional withholding on', () => {
    useAutomaticProvisionalWithholding()

    it('withholds a clear-screened intake and queues its restriction for review', async () => {
      const [{ notice, screeningId }, staff] = await Promise.all([
        createClearScreenedForm(),
        createStaffRequest(),
      ])

      await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

      const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
      expect(aggregate?.assessments).toEqual([
        expect.objectContaining({
          assessed_by_id: null,
          copyright_notice_form_screening_id: screeningId,
          substantially_compliant: true,
        }),
      ])
      await expect(
        countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
      ).resolves.toBe(1)
      await expect(isListedInReviewQueue(staff, notice.intake.copyright_notice_id)).resolves.toBe(
        true,
      )
      await reviewFormIntake(staff, notice.intake.id).expect(422)
    })
  })
})
