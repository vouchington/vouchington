import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { ai_agents } from '../queues.mts'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import {
  enqueueAutoDispatchJudgement,
  enqueueBulkAutoDispatchJudgements,
} from './auto-dispatch-judgement.mts'

describe('enqueueAutoDispatchJudgement', () => {
  beforeEach(async () => {
    await ai_agents.obliterate({ force: true })
  })

  it('enqueues an auto-dispatch-judgement job with simple deduplication by judgement_id', async () => {
    const judgementId = randomUUID()

    await enqueueAutoDispatchJudgement({
      judgement_id: judgementId,
      entity_type: 'post',
      entity_id: randomUUID(),
      community_id: null,
    })

    const job = (await getAutoDispatchJudgementJobs()).find(
      candidate =>
        candidate.name === 'auto-dispatch-judgement' &&
        (candidate.data as { judgement_id?: string }).judgement_id === judgementId,
    )
    expect(job?.opts.deduplication?.id).toBe(`auto_dispatch_judgement_${judgementId}`)
  })

  it('bulk-enqueues each judgement with its own simple dedup id and skips a replayed batch', async () => {
    const rows = [randomUUID(), randomUUID()].map(judgement_id => ({
      judgement_id,
      entity_type: 'post',
      entity_id: randomUUID(),
      community_id: null,
    }))

    await enqueueBulkAutoDispatchJudgements(rows)
    await enqueueBulkAutoDispatchJudgements(rows)

    for (const row of rows) {
      const jobs = await ai_agents.searchJobs({
        name: 'auto-dispatch-judgement',
        data: { judgement_id: row.judgement_id },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.data).toEqual(row)
      expect(jobs[0]?.opts).toMatchObject({
        attempts: AI_AGENTS_DEFAULTS.attempts,
        backoff: AI_AGENTS_DEFAULTS.backoff,
        removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
        removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
        priority: AGENT_PRIORITY['auto-dispatch-judgement'],
        deduplication: { id: `auto_dispatch_judgement_${row.judgement_id}`, mode: 'simple' },
      })
    }
  })
})

async function getAutoDispatchJudgementJobs() {
  return readAllQueueJobs(ai_agents)
}
