import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai_agents } from '../queues.mts'
import { enqueueAppealResolutionAndWait } from './appeal-resolution.mts'

vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('enqueueAppealResolutionAndWait', () => {
  const appealIds: string[] = []

  afterEach(async () => {
    const ownedAppealIds = new Set(appealIds.splice(0))
    const jobs = await getAppealResolutionJobs()
    await Promise.all(
      jobs.filter(job => ownedAppealIds.has(job.data.appeal_id)).map(job => job.remove()),
    )
  })

  it('coalesces manual reruns without swallowing them into automatic work', async () => {
    const appealId = randomUUID()
    appealIds.push(appealId)

    await Promise.all([
      enqueueAppealResolutionAndWait(appealId),
      enqueueAppealResolutionAndWait(appealId, randomUUID()),
      enqueueAppealResolutionAndWait(appealId, randomUUID()),
    ])

    const jobs = (await getAppealResolutionJobs()).filter(
      candidate => candidate.data.appeal_id === appealId,
    )
    expect(jobs).toHaveLength(2)
    expect(jobs.map(job => job.opts.deduplication)).toEqual(
      expect.arrayContaining([
        { id: `appeal_resolution_automatic_${appealId}`, mode: 'simple' },
        { id: `appeal_resolution_manual_${appealId}`, mode: 'simple' },
      ]),
    )
    expect(jobs.filter(job => job.data.rerun_by_id !== null)).toHaveLength(1)
    expect(jobs.map(job => job.opts.ordering)).toEqual([
      { key: `appeal_resolution_${appealId}`, concurrency: 1 },
      { key: `appeal_resolution_${appealId}`, concurrency: 1 },
    ])
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
