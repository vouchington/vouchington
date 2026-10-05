import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightStaffQueueCursorBefore } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { createTestCopyrightFormRejectionByErasedModerator } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { insertOpenCopyrightCounterNoticeDeadline } from '@voucha/test-helpers/data-stores/psql/copyright-staff-queue'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

type StaffRequest = ReturnType<typeof createRequest>

type QueuedCase = {
  id: string
  reasons: string[]
  form_review: {
    intake_id: string
    source_kind: string
    screening: {
      state: string
      recommendation: string | null
      rationale: string | null
      guidance: { summary: string; suggested_action: string } | null
    } | null
    review: { is_accepted: boolean; reviewed_at: string; reviewed_by_id: string | null } | null
  } | null
}

async function findQueuedCase(request: StaffRequest, noticeId: string): Promise<QueuedCase> {
  let after = await readCopyrightStaffQueueCursorBefore([noticeId])
  for (;;) {
    const page = await request
      .get(`/api/v1/copyright-notices/review-queue?limit=100&after=${encodeURIComponent(after)}`)
      .expect(200)
    const found = (page.body.copyright_notices as QueuedCase[]).find(item => item.id === noticeId)
    if (found) return found
    if (!page.body.page_info.has_next_page || !page.body.page_info.end_cursor) {
      throw new Error(`Copyright case ${noticeId} is not queued`)
    }
    after = page.body.page_info.end_cursor
  }
}

describe('copyright staff case form review after the decision', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the guidance, screening and the recorded review on a case that stays queued', async () => {
    const [{ notice }, moderator] = await Promise.all([
      createClearScreenedForm(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const request = createRequest()
    await request.authenticateAs(moderator)
    const noticeId = notice.intake.copyright_notice_id

    const unreviewed = await findQueuedCase(request, noticeId)
    expect(unreviewed.reasons).toContain('form_intake_review')
    expect(unreviewed.form_review).toMatchObject({
      intake_id: notice.intake.id,
      review: null,
      screening: { guidance: { summary: expect.any(String) } },
    })

    await request
      .post(`/api/v1/copyright-form-intakes/${notice.intake.id}/reviews`)
      .send({ is_accepted: true, rationale: 'The signed notice is complete.' })
      .expect(200)
    // The intake review no longer queues the case, so a later deadline keeps it in front of staff.
    await insertOpenCopyrightCounterNoticeDeadline({
      noticeId,
      reviewerUserId: moderator.id,
      state: 'due',
    })

    const reviewed = await findQueuedCase(request, noticeId)
    expect(reviewed.reasons).not.toContain('form_intake_review')
    expect(reviewed.reasons).toContain('deadline_due')
    expect(reviewed.form_review).toEqual({
      ...unreviewed.form_review,
      review: {
        is_accepted: true,
        reviewed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        reviewed_by_id: moderator.id,
      },
    })
    expect(JSON.stringify(reviewed.form_review)).not.toContain('The signed notice is complete.')
  }, 60_000)

  it('reports a review whose moderator account was erased with no reviewer', async () => {
    const [{ notice }, staff, erasedModerator] = await Promise.all([
      createClearScreenedForm(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
    ])
    const request = createRequest()
    await request.authenticateAs(staff)
    const noticeId = notice.intake.copyright_notice_id
    await createTestCopyrightFormRejectionByErasedModerator({
      intakeId: notice.intake.id,
      moderatorId: erasedModerator.id,
    })
    await insertOpenCopyrightCounterNoticeDeadline({
      noticeId,
      reviewerUserId: staff.id,
      state: 'due',
    })

    const { form_review: formReview } = await findQueuedCase(request, noticeId)

    expect(formReview?.screening?.guidance).not.toBeNull()
    expect(formReview?.review).toEqual({
      is_accepted: false,
      reviewed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      reviewed_by_id: null,
    })
  }, 60_000)
})
