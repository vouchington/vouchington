import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { ai_agents } from '../queues.mts'
import { enqueueReportJudgementAndWait } from './report-judgement.mts'

describe('enqueueReportJudgementAndWait', () => {
  beforeEach(async () => {
    await ai_agents.obliterate({ force: true })
  })

  it('serializes automatic judgement jobs per entity while deduping by context', async () => {
    const entityId = randomUUID()
    const triggeringReportId = randomUUID()

    await enqueueReportJudgementAndWait(
      'post',
      entityId,
      triggeringReportId,
      null,
      `ctx-${randomUUID()}`,
    )

    const job = (await getReportJudgementJobs()).find(isReportJudgementJobFor(entityId))
    expect(job?.opts).toMatchObject({
      ordering: {
        key: `report_judgement_post_${entityId}`,
        concurrency: 1,
      },
    })
    expect(job?.opts.deduplication?.id).toContain(`report_judgement_post_${entityId}_ctx-`)
  })

  it('does not deduplicate or serialize manual reruns', async () => {
    const entityId = randomUUID()
    const triggeringReportId = randomUUID()

    await enqueueReportJudgementAndWait(
      'post',
      entityId,
      triggeringReportId,
      randomUUID(),
      `ctx-${randomUUID()}`,
    )

    const job = (await getReportJudgementJobs()).find(isReportJudgementJobFor(entityId))
    expect(job?.opts.deduplication).toBeUndefined()
    expect(job?.opts.ordering).toBeUndefined()
  })
})

async function getReportJudgementJobs() {
  return readAllQueueJobs(ai_agents)
}

function isReportJudgementJobFor(entityId: string) {
  return (candidate: Awaited<ReturnType<typeof getReportJudgementJobs>>[number]) =>
    candidate.name === 'report-judgement' &&
    (candidate.data as { entity_id?: string }).entity_id === entityId
}
