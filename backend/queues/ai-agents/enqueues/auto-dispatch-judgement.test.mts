import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { ai_agents } from '../queues.mts'
import { enqueueAutoDispatchJudgement } from './auto-dispatch-judgement.mts'

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
})

async function getAutoDispatchJudgementJobs() {
  return readAllQueueJobs(ai_agents)
}
