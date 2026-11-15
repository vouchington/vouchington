import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, readAllQueueJobs } from '@voucha/test-helpers'
import {
  readCopyrightNoticeTargetId,
  readCopyrightStaffQueueCursorBefore,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  createCopyrightFormFixture,
  counterNoticeBody,
} from '@voucha/test-helpers/copyright-route-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  makeAgentModelCaller,
  makeModelCallResult,
} from '@voucha/test-helpers/agents/model-call-result'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { ai_agents } from '@queues/ai-agents/queues'
import type {
  CopyrightAppealRecommendationJobData,
  CopyrightFormScreeningJobData,
  CopyrightSubmissionGuidanceJobData,
} from '@queues/ai-agents/types'
import { processCopyrightAppealRecommendation } from '../../../workers/ai-agents/processors/process-copyright-appeal-recommendation.mts'
import { processCopyrightFormScreening } from '../../../workers/ai-agents/processors/process-copyright-form-screening.mts'
import { processCopyrightSubmissionGuidance } from '../../../workers/ai-agents/processors/process-copyright-submission-guidance.mts'
import { COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS } from '@ts-shared/utils/copyright-submission-guidance'
import { ALL_TOOLS } from '../../../mcp/registry/index.mts'
import type { Tool } from '@services/openai-agents/tool-types'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

type AiRun = { id: string; status: string } | null
type QueuedCase = {
  id: string
  form_review: {
    screening: {
      attempt_id: string
      state: string
      guidance: { summary: string } | null
    } | null
  } | null
  appeals: Array<{
    submission_id: string
    recommendation: { recommendation: string } | null
    ai_run: AiRun
  }>
  counter_notices: Array<{
    submission_id: string
    guidance: { summary: string } | null
    ai_run: AiRun
  }>
}

async function findCase(request: ReturnType<typeof createRequest>, noticeId: string) {
  let after = await readCopyrightStaffQueueCursorBefore([noticeId])
  for (;;) {
    const page = await request
      .get(`/api/v1/copyright-notices/review-queue?limit=100&after=${encodeURIComponent(after)}`)
      .expect(200)
    const found = (page.body.copyright_notices as QueuedCase[]).find(item => item.id === noticeId)
    if (found) return found
    if (!page.body.page_info.has_next_page || !page.body.page_info.end_cursor)
      throw new Error(`Copyright case ${noticeId} is not queued`)
    after = page.body.page_info.end_cursor
  }
}

/** The MCP review queue is the same read as REST, so one admitted run reports identically. */
async function findCaseViaMcp(
  user: Awaited<ReturnType<typeof createTestUser>>,
  noticeId: string,
): Promise<QueuedCase> {
  const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'list_copyright_review_queue')
  let after = await readCopyrightStaffQueueCursorBefore([noticeId])
  for (;;) {
    const page = (await (tool as Tool<{ after: string; limit: number }>).function(user)({
      after,
      limit: 100,
    })) as {
      copyright_notices: QueuedCase[]
      page_info: { has_next_page: boolean; end_cursor: string | null }
    }
    const found = page.copyright_notices.find(item => item.id === noticeId)
    if (found) return found
    if (!page.page_info.has_next_page || !page.page_info.end_cursor)
      throw new Error(`Copyright case ${noticeId} is not queued`)
    after = page.page_info.end_cursor
  }
}

async function createTestNotice(fixture: Awaited<ReturnType<typeof createCopyrightFormFixture>>) {
  const claimant = createRequest()
  await claimant.authenticateAs(fixture.claimant)
  const response = await claimant
    .post('/api/v1/copyright-notices')
    .set('Idempotency-Key', crypto.randomUUID())
    .send(fixture.form)
  expect(response.status).toBe(202)
  return response.body.copyright_notice.id as string
}

async function findJob(name: string, field: string, id: string) {
  return (await readAllQueueJobs(ai_agents)).find(
    job =>
      job.name === name && field in job.data && job.data[field as keyof typeof job.data] === id,
  )
}

describe('copyright AI queue admission and staff result polling', () => {
  useCopyrightIntakeEnvironment()
  beforeEach(() => vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'true'))

  it('returns a pending form before screening and then shows the saved screening guidance', async () => {
    const fixture = await createCopyrightFormFixture()
    const claimant = createRequest()
    await claimant.authenticateAs(fixture.claimant)
    const response = await claimant
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(fixture.form)
    expect(response.status).toBe(202)
    const noticeId = response.body.copyright_notice.id as string
    const submissionId = (await getCopyrightNoticePrivateAggregate(noticeId))?.submissions[0]?.id
    expect(submissionId).toBeDefined()
    const staff = createRequest()
    await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    const pending = (await findCase(staff, noticeId)).form_review?.screening
    expect(pending).toMatchObject({ attempt_id: expect.any(String), state: 'pending' })
    expect(pending?.guidance ?? null).toBeNull()
    const job = await findJob('copyright-form-screening', 'submission_id', submissionId!)
    expect(job).toBeDefined()
    try {
      const callModel = makeAgentModelCaller({
        recommendation: 'not_obviously_invalid',
        rationale: 'No obvious spam markers.',
        guidance: testCopyrightFormGuidance,
      })
      await withReservedAiUsageDay(10_000_000, () =>
        processCopyrightFormScreening(job! as Job<CopyrightFormScreeningJobData>, callModel),
      )
      expect((await findCase(staff, noticeId)).form_review?.screening).toMatchObject({
        attempt_id: pending!.attempt_id,
        state: 'completed',
        guidance: { summary: testCopyrightFormGuidance.summary },
      })
      expect(callModel).toHaveBeenCalledOnce()
    } finally {
      await job?.remove()
    }
  })

  it('returns a pending copyright appeal before the recommendation and then shows the advice', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createTestNotice(fixture)
    const targetId = await readCopyrightNoticeTargetId(noticeId)
    const poster = createRequest()
    await poster.authenticateAs(fixture.poster)
    const appeal = await poster
      .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'This is my image.', target_ids: [targetId] })
      .expect(201)
    const submissionId = appeal.body.copyright_submission.id as string
    const staff = createRequest()
    const moderator = await createTestUser({ extraRoles: ['administrator'] })
    await staff.authenticateAs(moderator)
    const current = () => findCase(staff, noticeId)
    const appealOf = (queued: QueuedCase) =>
      queued.appeals.find(item => item.submission_id === submissionId)
    expect(appealOf(await current())?.recommendation).toBeNull()
    const job = await findJob('copyright-appeal-recommendation', 'submission_id', submissionId)
    expect(job).toBeDefined()
    // The admitted run is the exact one the queued job carries, and REST and MCP agree on it.
    const runId = (job!.data as CopyrightAppealRecommendationJobData).run_id
    expect(appealOf(await current())?.ai_run).toEqual({ id: runId, status: 'active' })
    expect(appealOf(await findCaseViaMcp(moderator, noticeId))?.ai_run).toEqual({
      id: runId,
      status: 'active',
    })
    try {
      const callModel = makeAgentModelCaller({
        recommendation: 'reverse',
        rationale: 'Moderator review is required.',
      })
      await withReservedAiUsageDay(10_000_000, () =>
        processCopyrightAppealRecommendation(
          job! as Job<CopyrightAppealRecommendationJobData>,
          callModel,
        ),
      )
      expect(appealOf(await current())?.recommendation).toMatchObject({ recommendation: 'reverse' })
      expect(appealOf(await current())?.ai_run).toEqual({ id: runId, status: 'succeeded' })
      expect(appealOf(await findCaseViaMcp(moderator, noticeId))?.ai_run).toEqual({
        id: runId,
        status: 'succeeded',
      })
      expect(callModel).toHaveBeenCalledOnce()
    } finally {
      await job?.remove()
    }
  })

  it('returns a pending counter-notice before guidance and then shows the saved guidance', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createTestNotice(fixture)
    const targetId = await readCopyrightNoticeTargetId(noticeId)
    const poster = createRequest()
    await poster.authenticateAs(fixture.poster)
    const filing = await poster
      .post(`/api/v1/copyright-notices/${noticeId}/counter-notices`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(counterNoticeBody(targetId))
      .expect(201)
    const submissionId = filing.body.copyright_submission.id as string
    const staff = createRequest()
    const moderator = await createTestUser({ extraRoles: ['administrator'] })
    await staff.authenticateAs(moderator)
    const current = () => findCase(staff, noticeId)
    const counterOf = (queued: QueuedCase) =>
      queued.counter_notices.find(item => item.submission_id === submissionId)
    expect(counterOf(await current())?.guidance).toBeNull()
    const job = await findJob('copyright-submission-guidance', 'submission_id', submissionId)
    expect(job).toBeDefined()
    const runId = (job!.data as CopyrightSubmissionGuidanceJobData).run_id
    expect(counterOf(await current())?.ai_run).toEqual({ id: runId, status: 'active' })
    expect(counterOf(await findCaseViaMcp(moderator, noticeId))?.ai_run).toEqual({
      id: runId,
      status: 'active',
    })
    try {
      const guidance = {
        summary: 'The filer disputes the image restriction.',
        elements: COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.map(element => ({
          element,
          status: 'present' as const,
          gap: null,
        })),
        risk_notes: [],
      }
      const callModel = vi.fn<
        NonNullable<Parameters<typeof processCopyrightSubmissionGuidance>[1]>
      >(async () => makeModelCallResult(guidance))
      await withReservedAiUsageDay(10_000_000, () =>
        processCopyrightSubmissionGuidance(
          job! as Job<CopyrightSubmissionGuidanceJobData>,
          callModel,
        ),
      )
      expect(counterOf(await current())?.guidance).toMatchObject({ summary: guidance.summary })
      expect(counterOf(await current())?.ai_run).toEqual({ id: runId, status: 'succeeded' })
      expect(counterOf(await findCaseViaMcp(moderator, noticeId))?.ai_run).toEqual({
        id: runId,
        status: 'succeeded',
      })
      expect(callModel).toHaveBeenCalledOnce()
    } finally {
      await job?.remove()
    }
  })
})
