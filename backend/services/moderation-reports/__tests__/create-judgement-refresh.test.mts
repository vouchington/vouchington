import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost, readAllQueueJobs } from '@voucha/test-helpers'
import { ai_agents } from '@queues/ai-agents/queues'
import { createModerationReport } from '../create.mts'
import { parseCreateModerationReportInput } from '../parse.mts'
import { insertReportJudgement } from '../judgements.mts'

describe('createModerationReport judgement refresh', () => {
  it('enqueues a fresh judgement job when a later report changes report count', async () => {
    const { postId, authorId } = await createReportTarget('refresh-count')
    const firstReporter = await createTestUser()
    const secondReporter = await createTestUser()
    const first = await createModerationReport(
      firstReporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: 'first',
      }),
    )
    await waitForJudgementJobCount(postId, 1)
    await insertFreshJudgement(postId, first.report.id)

    await createModerationReport(
      secondReporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: `second from ${authorId}`,
      }),
    )

    // waitForJudgementJobCount's own expect.poll() carries the real assertion; wrap it here too
    // so the check is visible directly in this test body, not just inside the helper.
    await expect(waitForJudgementJobCount(postId, 2)).resolves.not.toThrow()
  })

  it('enqueues a fresh judgement job when a duplicate report raises reason severity', async () => {
    const { postId } = await createReportTarget('refresh-rank')
    const reporter = await createTestUser()
    const first = await createModerationReport(
      reporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: 'same',
      }),
    )
    await waitForJudgementJobCount(postId, 1)
    await insertFreshJudgement(postId, first.report.id)

    await createModerationReport(
      reporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'illegal_content',
        note: 'same',
      }),
    )

    // waitForJudgementJobCount's own expect.poll() carries the real assertion; wrap it here too
    // so the check is visible directly in this test body, not just inside the helper.
    await expect(waitForJudgementJobCount(postId, 2)).resolves.not.toThrow()
  })

  it('enqueues a fresh judgement job when a duplicate report changes note', async () => {
    const { postId } = await createReportTarget('refresh-note')
    const reporter = await createTestUser()
    const first = await createModerationReport(
      reporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: 'first',
      }),
    )
    await waitForJudgementJobCount(postId, 1)
    await insertFreshJudgement(postId, first.report.id)

    await createModerationReport(
      reporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: 'updated',
      }),
    )

    // waitForJudgementJobCount's own expect.poll() carries the real assertion; wrap it here too
    // so the check is visible directly in this test body, not just inside the helper.
    await expect(waitForJudgementJobCount(postId, 2)).resolves.not.toThrow()
  })

  it('does not enqueue a fresh judgement job when only duplicate reason severity decreases', async () => {
    const { postId } = await createReportTarget('skip-lower-rank')
    const reporter = await createTestUser()
    const first = await createModerationReport(
      reporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'illegal_content',
        note: 'same',
      }),
    )
    await waitForJudgementJobCount(postId, 1)
    await insertFreshJudgement(postId, first.report.id, 'escalate')

    await createModerationReport(
      reporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: 'same',
      }),
    )
    await expectNoAdditionalJudgementJobs(postId, 1)

    await expect(getJudgementJobsForEntity(postId)).resolves.toHaveLength(1)
  })
})

async function createReportTarget(label: string): Promise<{ postId: string; authorId: string }> {
  const author = await createTestUser()
  const suffix = crypto.randomUUID().slice(0, 8)
  const postId = await insertTestPost({
    createdById: author.id,
    slug: `report-${label}-${suffix}`,
    title: `Report ${label} ${suffix}`,
    markdown: 'Test body',
  })
  return { postId, authorId: author.id }
}

function insertFreshJudgement(
  postId: string,
  triggeringReportId: string,
  recommendedAction: 'no_action' | 'escalate' = 'no_action',
): Promise<unknown> {
  return insertReportJudgement({
    entityType: 'post',
    entityId: postId,
    triggeringReportId,
    recommendedAction,
    publicResponse: 'ok',
    internalResponse: 'ok',
    model: 'test',
  })
}

async function waitForJudgementJobCount(entityId: string, count: number): Promise<void> {
  await expect
    .poll(() => getJudgementJobsForEntity(entityId).then(jobs => jobs.length), { timeout: 2000 })
    .toBe(count)
}

async function expectNoAdditionalJudgementJobs(
  entityId: string,
  expectedCount: number,
): Promise<void> {
  await expect(getJudgementJobsForEntity(entityId)).resolves.toHaveLength(expectedCount)
  const observation = AbortSignal.timeout(250)
  await new Promise<void>(resolve => {
    observation.addEventListener('abort', () => resolve(), { once: true })
  })
  await expect(getJudgementJobsForEntity(entityId)).resolves.toHaveLength(expectedCount)
}

async function getJudgementJobsForEntity(entityId: string) {
  const jobs = await readAllQueueJobs(ai_agents)
  return jobs.filter(job => {
    const data = job.data as { entity_id?: string }
    return data.entity_id === entityId
  })
}
