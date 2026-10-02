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
import { readTestAutomaticWithholdingOutcome } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding-reads'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  appendCopyrightSubmissionAssessment,
  applyNonSpamSignedInCopyrightFormScreening,
  enforceCopyrightAssessment,
  searchPendingCopyrightEnforcementAssessmentIds,
} from '@services/copyright-notices'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

type StaffRequest = ReturnType<typeof createRequest>

async function createStaffRequest(): Promise<StaffRequest> {
  const request = createRequest()
  await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return request
}

async function findInReviewQueue(
  request: StaffRequest,
  noticeId: string,
): Promise<{ id: string; reasons: string[] } | undefined> {
  let after = await readCopyrightStaffQueueCursorBefore([noticeId])
  for (;;) {
    const page = await request
      .get(`/api/v1/copyright-notices/review-queue?limit=100&after=${encodeURIComponent(after)}`)
      .expect(200)
    const queued = page.body.copyright_notices.find(
      (notice: { id: string }) => notice.id === noticeId,
    )
    if (queued) return queued
    if (!page.body.page_info.has_next_page || !page.body.page_info.end_cursor) return undefined
    after = page.body.page_info.end_cursor
  }
}

async function isListedInReviewQueue(request: StaffRequest, noticeId: string): Promise<boolean> {
  return (await findInReviewQueue(request, noticeId)) !== undefined
}

/** A clear-screened form received two years ago, before the switch-on the test helper records. */
async function createFormReceivedBeforeSwitchOn() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
  try {
    return await createClearScreenedForm()
  } finally {
    vi.useRealTimers()
  }
}

function reviewFormIntake(request: StaffRequest, intakeId: string) {
  return request
    .post(`/api/v1/copyright-form-intakes/${intakeId}/reviews`)
    .send({ accepted: true, rationale: 'The signed notice is complete.' })
}

describe('moderator-first copyright withholding', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('keeps an automated assessment from before the switch-off unrestricted and queued until a moderator accepts', async () => {
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

    await enforceCopyrightAssessment(automated.id)
    await expect(
      readTestOwnedCopyrightSweepIds(searchPendingCopyrightEnforcementAssessmentIds, automated.id),
    ).resolves.toEqual([])
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
    await expect(
      findInReviewQueue(staff, notice.intake.copyright_notice_id),
    ).resolves.toMatchObject({ reasons: expect.arrayContaining(['enforcement_pending']) })

    await reviewFormIntake(staff, notice.intake.id).expect(200)
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
    await enforceCopyrightAssessment(automated.id)
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
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

    it('enforces an automated assessment left pending from the current on-period', async () => {
      const { notice, screeningId } = await createClearScreenedForm()
      const automated = await appendCopyrightSubmissionAssessment({
        submissionId: notice.intake.copyright_notice_submission_id,
        assessedAt: new Date(),
        currentUser: null,
        substantiallyCompliant: true,
        copyrightFormScreeningId: screeningId,
      })

      await expect(
        readTestOwnedCopyrightSweepIds(
          searchPendingCopyrightEnforcementAssessmentIds,
          automated.id,
        ),
      ).resolves.toEqual([automated.id])
      await enforceCopyrightAssessment(automated.id)
      await expect(
        countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
      ).resolves.toBe(1)
    })

    it('does not enforce an automated assessment left pending from before the switch-on, and shows moderators', async () => {
      // Sign in first: the helper moves the clock back, and a session minted then is already expired.
      const staff = await createStaffRequest()
      const { notice, screeningId } = await createFormReceivedBeforeSwitchOn()
      const automated = await appendCopyrightSubmissionAssessment({
        submissionId: notice.intake.copyright_notice_submission_id,
        assessedAt: new Date(),
        currentUser: null,
        substantiallyCompliant: true,
        copyrightFormScreeningId: screeningId,
      })

      await enforceCopyrightAssessment(automated.id)

      await expect(
        readTestOwnedCopyrightSweepIds(
          searchPendingCopyrightEnforcementAssessmentIds,
          automated.id,
        ),
      ).resolves.toEqual([])
      await expect(
        countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
      ).resolves.toBe(0)
      await expect(
        findInReviewQueue(staff, notice.intake.copyright_notice_id),
      ).resolves.toMatchObject({ reasons: expect.arrayContaining(['enforcement_pending']) })
      await reviewFormIntake(staff, notice.intake.id).expect(200)
      await expect(
        countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
      ).resolves.toBe(1)
    })

    it('refuses a notice received before the switch-on and lets a moderator accept it', async () => {
      const staff = await createStaffRequest()
      const { notice } = await createFormReceivedBeforeSwitchOn()

      await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

      await expect(readTestAutomaticWithholdingOutcome(notice)).resolves.toEqual({
        refusal: 'received_before_switch_on',
        assessments: 0,
        restrictions: 0,
      })
      await expect(isListedInReviewQueue(staff, notice.intake.copyright_notice_id)).resolves.toBe(
        true,
      )
      await reviewFormIntake(staff, notice.intake.id).expect(200)
      await expect(
        countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
      ).resolves.toBe(1)
    })
  })
})
