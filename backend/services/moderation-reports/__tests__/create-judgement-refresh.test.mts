import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  readAllQueueJobs,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { ai_agents } from '@queues/ai-agents/queues'
import * as reportJudgementEnqueue from '@queues/ai-agents/enqueues/report-judgement'
import { createModerationReport } from '../create.mts'
import * as judgementRefresh from '../judgement-refresh.mts'
import { parseCreateModerationReportInput } from '../parse.mts'
import { insertReportJudgement } from '../judgements.mts'

describe('createModerationReport judgement refresh', () => {
  it('enqueues a fresh judgement job when a later report changes report count', async () => {
    const { postId, authorId } = await createReportTarget('refresh-count')
    const firstReporter = await createTestUser()
    const secondReporter = await createTestUser()
    const first = await awaitReportJudgementSideEffect(() =>
      createModerationReport(
        firstReporter.id,
        WEB_PROVENANCE,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: postId,
          reason: 'spam',
          note: 'first',
        }),
      ),
    )
    await insertFreshJudgement(postId, first.report.id)

    await awaitReportJudgementSideEffect(() =>
      createModerationReport(
        secondReporter.id,
        WEB_PROVENANCE,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: postId,
          reason: 'spam',
          note: `second from ${authorId}`,
        }),
      ),
    )

    expect(await getJudgementJobsForEntity(postId)).toHaveLength(2)
  })

  it('enqueues a fresh judgement job when a duplicate report raises reason severity', async () => {
    const { postId } = await createReportTarget('refresh-rank')
    const reporter = await createTestUser()
    const first = await awaitReportJudgementSideEffect(() =>
      createModerationReport(
        reporter.id,
        WEB_PROVENANCE,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: postId,
          reason: 'spam',
          note: 'same',
        }),
      ),
    )
    await insertFreshJudgement(postId, first.report.id)

    await awaitReportJudgementSideEffect(() =>
      createModerationReport(
        reporter.id,
        WEB_PROVENANCE,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: postId,
          reason: 'illegal_content',
          note: 'same',
        }),
      ),
    )

    expect(await getJudgementJobsForEntity(postId)).toHaveLength(2)
  })

  it('enqueues a fresh judgement job when a duplicate report changes note', async () => {
    const { postId } = await createReportTarget('refresh-note')
    const reporter = await createTestUser()
    const first = await awaitReportJudgementSideEffect(() =>
      createModerationReport(
        reporter.id,
        WEB_PROVENANCE,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: postId,
          reason: 'spam',
          note: 'first',
        }),
      ),
    )
    await insertFreshJudgement(postId, first.report.id)

    await awaitReportJudgementSideEffect(() =>
      createModerationReport(
        reporter.id,
        WEB_PROVENANCE,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: postId,
          reason: 'spam',
          note: 'updated',
        }),
      ),
    )

    expect(await getJudgementJobsForEntity(postId)).toHaveLength(2)
  })

  it('does not enqueue a fresh judgement job when only duplicate reason severity decreases', async () => {
    const { postId } = await createReportTarget('skip-lower-rank')
    const reporter = await createTestUser()
    const first = await awaitReportJudgementSideEffect(() =>
      createModerationReport(
        reporter.id,
        WEB_PROVENANCE,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: postId,
          reason: 'illegal_content',
          note: 'same',
        }),
      ),
    )
    await insertFreshJudgement(postId, first.report.id, 'escalate')

    await awaitReportJudgementSideEffect(() =>
      createModerationReport(
        reporter.id,
        WEB_PROVENANCE,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: postId,
          reason: 'spam',
          note: 'same',
        }),
      ),
    )

    expect(await getJudgementJobsForEntity(postId)).toHaveLength(1)
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

async function awaitReportJudgementSideEffect<T>(run: () => Promise<T>): Promise<T> {
  const enqueue = reportJudgementEnqueue.enqueueReportJudgementAndWait
  const pending: Promise<unknown>[] = []
  const settled = Promise.withResolvers<void>()
  const enqueueSpy = vi
    .spyOn(reportJudgementEnqueue, 'enqueueReportJudgementAndWait')
    .mockImplementation((...args) => {
      const result = Promise.resolve(enqueue(...args)).finally(() => {
        settled.resolve()
      })
      pending.push(result)
      return result
    })
  const refresh = judgementRefresh.shouldRefreshReportJudgementForEntity
  const refreshSpy = vi
    .spyOn(judgementRefresh, 'shouldRefreshReportJudgementForEntity')
    .mockImplementation(async (...args) => {
      const decision = await refresh(...args)
      if (!decision.refresh) settled.resolve()
      return decision
    })
  try {
    const result = await run()
    await settled.promise
    await Promise.all(pending)
    return result
  } finally {
    enqueueSpy.mockRestore()
    refreshSpy.mockRestore()
  }
}

async function getJudgementJobsForEntity(entityId: string) {
  const jobs = await readAllQueueJobs(ai_agents)
  return jobs.filter(job => {
    const data = job.data as { entity_id?: string }
    return data.entity_id === entityId
  })
}
