import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai_agents } from '../queues.mts'
import { enqueueAppealResolutionQueued } from './appeal-resolution.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('enqueueAppealResolution', () => {
  const appealIds: string[] = []

  afterEach(async () => {
    const ownedAppealIds = new Set(appealIds.splice(0))
    const jobs = await getAppealResolutionJobs()
    await Promise.all(
      jobs.filter(job => ownedAppealIds.has(job.data.appeal_id)).map(job => job.remove()),
    )
  })

  it('admits each manual request after automatic work with its own durable run ID', async () => {
    const appealId = randomUUID()
    const automaticRunId = randomUUID()
    const firstManualRunId = randomUUID()
    const secondManualRunId = randomUUID()
    appealIds.push(appealId)

    await Promise.all([
      enqueueAppealResolutionQueued(appealId, automaticRunId),
      enqueueAppealResolutionQueued(appealId, firstManualRunId, randomUUID()),
      enqueueAppealResolutionQueued(appealId, secondManualRunId, randomUUID()),
    ])

    const jobs = (await getAppealResolutionJobs()).filter(
      candidate => candidate.data.appeal_id === appealId,
    )
    expect(jobs.map(job => job.id).toSorted()).toEqual(
      [automaticRunId, firstManualRunId, secondManualRunId]
        .map(runId => `appeal_resolution_${runId}`)
        .toSorted(),
    )
    expect(jobs).toHaveLength(3)
    expect(jobs.filter(job => job.data.rerun_by_id !== null)).toHaveLength(2)
    expect(jobs.filter(job => job.opts.deduplication)).toHaveLength(1)
    expect(jobs.every(job => job.opts.ordering?.key === `appeal_resolution_${appealId}`)).toBe(true)
  })
})

async function getAppealResolutionJobs() {
  const jobs = (
    await Promise.all([
      ai_agents.getJobs('waiting'),
      ai_agents.getJobs('active'),
      ai_agents.getJobs('completed'),
      ai_agents.getJobs('failed'),
      ai_agents.getJobs('delayed'),
    ])
  ).flat()
  return jobs.filter(
    (
      job,
    ): job is (typeof jobs)[number] & {
      data: { appeal_id: string; rerun_by_id: string | null }
    } => job.name === 'appeal-resolution',
  )
}
