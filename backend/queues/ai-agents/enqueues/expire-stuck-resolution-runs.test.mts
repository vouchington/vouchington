import { beforeEach, describe, expect, it } from 'vitest'
import { AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import {
  enqueueExpireStuckReportJudgementRuns,
  enqueueExpireStuckAppealResolutionRuns,
  enqueueExpireStuckDisputeResolutionRuns,
} from './expire-stuck-resolution-runs.mts'

describe('expire stuck resolution run enqueues', () => {
  beforeEach(async () => {
    await ai_agents.obliterate({ force: true })
  })

  it.each([
    ['expire-stuck-report-judgement-runs', enqueueExpireStuckReportJudgementRuns],
    ['expire-stuck-appeal-resolution-runs', enqueueExpireStuckAppealResolutionRuns],
    ['expire-stuck-dispute-resolution-runs', enqueueExpireStuckDisputeResolutionRuns],
  ] as const)('enqueues %s at its configured priority', async (name, enqueue) => {
    await enqueue()
    const [job] = await ai_agents.searchJobs({ name })
    expect(job?.opts.priority).toBe(AGENT_PRIORITY[name])
  })
})
