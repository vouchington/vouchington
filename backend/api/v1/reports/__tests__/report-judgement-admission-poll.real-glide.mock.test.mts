import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { makeAgentModelCaller } from '@voucha/test-helpers/agents/model-call-result'
import { ai_agents } from '@queues/ai-agents/queues'
import type { ReportJudgementJobData } from '@queues/ai-agents/types'
import { processReportJudgement } from '../../../../workers/ai-agents/processors/process-report-judgement.mts'
import { insertReportJudgement } from '@services/moderation-reports/judgements'
import {
  markReportJudgementRunExpired,
  markReportJudgementRunFailed,
} from '@services/moderation-reports/rerun-outcomes'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('report judgement queue admission and result polling', () => {
  it('returns queued while the report has no judgement, then reads the persisted judgement directly', async () => {
    const staff = await createTestUser({ administrator: true })
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `report-admission-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report admission ${crypto.randomUUID()}`,
      markdown: 'Post body for judgement.',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    const request = createRequest()
    await request.authenticateAs(staff)
    const admission = (
      await request.post(`/api/v1/reports/${reportId}/judgements`).send({}).expect(202)
    ).body as {
      queued: boolean
      rerun_by_id: string
      run_id: string
    }
    expect(admission).toMatchObject({
      queued: true,
      rerun_by_id: staff.id,
      run_id: expect.any(String),
    })
    const pollRun = async () =>
      (await request.get(`/api/v1/reports/${reportId}/judgements/${admission.run_id}`).expect(200))
        .body
    expect(await pollRun()).toEqual({
      run_id: admission.run_id,
      status: 'active',
      judgement_id: null,
    })
    await request.get(`/api/v1/reports/${reportId}/judgements/${crypto.randomUUID()}`).expect(404)
    const otherReportId = await insertTestModerationReport({
      reporterUserId: (await createTestUser()).id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    await request.get(`/api/v1/reports/${otherReportId}/judgements/${admission.run_id}`).expect(404)
    await createRequest()
      .get(`/api/v1/reports/${reportId}/judgements/${admission.run_id}`)
      .expect(401)
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(reporter)
    await memberRequest
      .get(`/api/v1/reports/${reportId}/judgements/${admission.run_id}`)
      .expect(403)
    const poll = async () => {
      return (await request.get(`/api/v1/reports/${reportId}`).expect(200)).body
    }
    // A different judgement becoming latest must not complete this admitted manual run.
    await insertReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      recommendedAction: 'no_action',
      publicResponse: 'Other result',
      internalResponse: 'Other result',
      model: 'test-model',
    })
    expect(await pollRun()).toEqual({
      run_id: admission.run_id,
      status: 'active',
      judgement_id: null,
    })
    const jobs = await readAllQueueJobs(ai_agents)
    const job = jobs.find(
      candidate =>
        candidate.name === 'report-judgement' &&
        'triggering_report_id' in candidate.data &&
        candidate.data.triggering_report_id === reportId &&
        'rerun_by_id' in candidate.data &&
        candidate.data.rerun_by_id === staff.id,
    )
    expect(job).toBeDefined()
    expect((job!.data as ReportJudgementJobData).run_id).toBe(admission.run_id)
    try {
      const callModel = makeAgentModelCaller({
        recommended_action: 'no_action',
        public_response: 'Content looks fine.',
        internal_response: 'No policy violation.',
      })
      await processReportJudgement(job! as Job<ReportJudgementJobData>, callModel)
      expect(await pollRun()).toEqual({
        run_id: admission.run_id,
        status: 'succeeded',
        judgement_id: expect.any(String),
      })
      await markReportJudgementRunFailed(reportId, admission.run_id)
      await markReportJudgementRunExpired(reportId, admission.run_id)
      expect(await pollRun()).toEqual({
        run_id: admission.run_id,
        status: 'succeeded',
        judgement_id: expect.any(String),
      })
      await processReportJudgement(job! as Job<ReportJudgementJobData>, callModel)
      expect(await poll()).toMatchObject({
        report: { id: reportId },
        judgement: { id: expect.any(String), recommended_action: 'no_action' },
      })
      expect(callModel).toHaveBeenCalledOnce()

      const failedAdmission = (
        await request.post(`/api/v1/reports/${reportId}/judgements`).send({}).expect(202)
      ).body as { run_id: string }
      await markReportJudgementRunFailed(reportId, failedAdmission.run_id)
      expect(
        (
          await request
            .get(`/api/v1/reports/${reportId}/judgements/${failedAdmission.run_id}`)
            .expect(200)
        ).body,
      ).toEqual({ run_id: failedAdmission.run_id, status: 'failed', judgement_id: null })
      const failedJob = (await readAllQueueJobs(ai_agents)).find(
        candidate =>
          candidate.name === 'report-judgement' &&
          'run_id' in candidate.data &&
          candidate.data.run_id === failedAdmission.run_id,
      )
      expect(failedJob).toBeDefined()
      const rejectedReplay = makeAgentModelCaller({
        recommended_action: 'no_action',
        public_response: 'Should not be generated.',
        internal_response: 'Should not be generated.',
      })
      await processReportJudgement(failedJob! as Job<ReportJudgementJobData>, rejectedReplay)
      expect(rejectedReplay).not.toHaveBeenCalled()
      await failedJob?.remove()
    } finally {
      await job?.remove()
    }
  })
})
