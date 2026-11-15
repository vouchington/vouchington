import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModeratorAction,
} from '@voucha/test-helpers'
import {
  readTestReportingSourceDayEventId,
  reportingTestWorkerConnection,
  readTestModeratorWorkloadActor,
} from '@voucha/test-helpers/reporting-daily-rollups'
import { streamEntityReconciliationCandidateBatches } from '@services/entity-listener-reconciliation'
import { startBackgroundHarness } from '@voucha/test-helpers/real-glide-background'
import { REPORTING_CHANGED_DAY_JOB } from '@queues/background/enqueues/reporting-jobs'
import { createBackgroundProcessor } from '../../background/processors.mts'
import { reportingHandlers } from './reporting.mts'

describe('reporting daily recomputation', () => {
  it('reconciles a historical action insertion into workload through the real ordered worker', async () => {
    const started = new Date(Date.now() - 1000)
    const actor = await createTestUser()
    const community = await insertTestCommunity({ createdById: actor.id })
    const occurredAt = new Date(Date.now() - 20 * 86_400_000)
    occurredAt.setUTCHours(12, 0, 0, 0)
    const day = occurredAt.toISOString().slice(0, 10)
    await insertTestModeratorAction({
      actorId: actor.id,
      communityId: community.id,
      occurredAt,
      actionType: 'approve',
    })
    const id = await readTestReportingSourceDayEventId(day, 'moderator_action_creation', started)
    expect(id).toBeTypeOf('string')
    let found: { entityType: string; entityId: string } | undefined
    for await (const batch of streamEntityReconciliationCandidateBatches({
      start: started,
      end: new Date(),
    })) {
      const candidate = batch.find(row => row.changeId === id)
      if (candidate) {
        found = candidate
        break
      }
    }
    expect(found).toMatchObject({ entityType: 'reporting_workload', entityId: day })
    const handler = reportingHandlers.find(
      entry => entry.job.name === REPORTING_CHANGED_DAY_JOB.name,
    )!
    const harness = await startBackgroundHarness({
      connection: reportingTestWorkerConnection(),
      createProcessor: createBackgroundProcessor,
      bodies: { [handler.job.name]: job => handler.handle(job) },
    })
    try {
      const job = await harness.add(REPORTING_CHANGED_DAY_JOB, {
        kind: 'moderator_workload',
        day,
        revision: id,
      })
      await expect(harness.settled(job)).resolves.toBe('completed')
      expect(await readTestModeratorWorkloadActor(day, community.id, actor.id)).toEqual([
        { action_type: 'approve', count: 1 },
      ])
    } finally {
      await harness.close()
    }
  })
})
