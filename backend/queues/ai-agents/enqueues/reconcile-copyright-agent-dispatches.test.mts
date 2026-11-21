import { describe, expect, it, onTestFinished } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { ai_agents } from '../queues.mts'
import { COPYRIGHT_AGENT_DISPATCH_JOBS } from './copyright-agent-dispatch-stages.mts'
import { enqueueReconcileCopyrightAgentDispatchStage } from './reconcile-copyright-agent-dispatches.mts'

describe('enqueueReconcileCopyrightAgentDispatchStage', () => {
  it('enqueues a scheduled stage sweep from the start, deduplicated by its stage', async () => {
    const stage = 'submission-guidance'
    await enqueueReconcileCopyrightAgentDispatchStage(stage)
    const jobs = (await readAllQueueJobs(ai_agents)).filter(
      job =>
        job.name === COPYRIGHT_AGENT_DISPATCH_JOBS[stage].jobName &&
        (job.data as { after?: string }).after === undefined,
    )
    onTestFinished(() =>
      Promise.all(jobs.map(job => ai_agents.getJob(job.id).then(j => j?.remove()))),
    )

    expect(jobs.map(job => job.opts.deduplication?.id)).toContain(
      'copyright-agent-sweep:submission-guidance:root',
    )
  })
})
