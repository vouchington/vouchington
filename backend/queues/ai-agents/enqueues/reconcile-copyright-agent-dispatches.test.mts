import { describe, expect, it, onTestFinished } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { ai_agents } from '../queues.mts'
import { COPYRIGHT_AGENT_DISPATCH_JOBS } from './copyright-agent-dispatch-stages.mts'
import { scheduledJobManifest } from './schedules.mts'

describe('copyright agent dispatch scheduled sweep', () => {
  it('enqueues a stage sweep from the start, deduplicated by its stage', async () => {
    const { schedulerId, jobName } = COPYRIGHT_AGENT_DISPATCH_JOBS['submission-guidance']
    const surface = scheduledJobManifest.jobs
      .find(job => job.schedulerId === schedulerId)!
      .operatorSurfaces.find(candidate => candidate.kind === 'scheduled-jobs')!
    if (surface.kind !== 'scheduled-jobs') throw new Error('Missing scheduled trigger')

    await surface.trigger()

    const jobs = (await readAllQueueJobs(ai_agents)).filter(
      job => job.name === jobName && (job.data as { after?: string }).after === undefined,
    )
    onTestFinished(async () => {
      await Promise.all(jobs.map(job => ai_agents.getJob(job.id).then(queued => queued?.remove())))
    })
    expect(jobs.map(job => job.opts.deduplication?.id)).toContain(
      'copyright-agent-sweep:submission-guidance:root',
    )
  })
})
