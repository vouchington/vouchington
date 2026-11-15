import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { readTestReportingJobsByRevision } from '@voucha/test-helpers/reporting-daily-rollups'
import {
  enqueueReportingJob,
  enqueueReportingMaterialization,
} from '@queues/background/enqueues/reporting'
import {
  REPORTING_CHANGED_DAY_JOB,
  REPORTING_DAILY_JOB,
} from '@queues/background/enqueues/reporting-jobs'
import { reconcileEntity } from './reconciliation.mts'
import { reportingHandlers } from './reporting.mts'

describe('reporting admission', () => {
  it('admits both projections once per revision, separates changed days and admits later revisions', async () => {
    const revision = crypto.randomUUID()
    await enqueueReportingMaterialization(revision)
    await enqueueReportingMaterialization(revision)
    const daily = await readTestReportingJobsByRevision(revision)
    expect(daily).toHaveLength(2)
    expect(
      daily.map(job => job.data.kind).toSorted((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(['growth', 'moderator_workload'])
    expect(daily.every(job => job.name === REPORTING_DAILY_JOB.name)).toBe(true)
    expect(new Set(daily.map(job => job.id)).size).toBe(2)

    const day = '2000-01-01'
    await enqueueReportingJob({ kind: 'growth', day, revision })
    await enqueueReportingJob({ kind: 'growth', day, revision })
    const changed = (await readTestReportingJobsByRevision(revision)).filter(
      job => job.data.day === day,
    )
    expect(changed).toHaveLength(1)
    expect(changed[0]!.name).toBe(REPORTING_CHANGED_DAY_JOB.name)
    expect(changed[0]!.data).toEqual({ kind: 'growth', day, revision })
    expect(daily.map(job => job.id)).not.toContain(changed[0]!.id)

    const nextRevision = crypto.randomUUID()
    await enqueueReportingJob({ kind: 'growth', revision: nextRevision })
    const next = await readTestReportingJobsByRevision(nextRevision)
    expect(next).toHaveLength(1)
    expect(next[0]!.name).toBe(REPORTING_DAILY_JOB.name)
    expect(daily.map(job => job.id)).not.toContain(next[0]!.id)
  })

  it.each([
    ['reporting_growth', 'growth'],
    ['reporting_workload', 'moderator_workload'],
  ] as const)('routes %s reconciliation to a changed-day job', async (entityType, kind) => {
    const revision = crypto.randomUUID()
    const day = '2000-01-02'
    const queuedRevision = `${revision}-946771200000000`
    await reconcileEntity({
      entityType,
      entityId: day,
      changeId: revision,
      changedAtEpochUs: '946771200000000',
    })
    const jobs = await readTestReportingJobsByRevision(queuedRevision)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.name).toBe(REPORTING_CHANGED_DAY_JOB.name)
    expect(jobs[0]!.data).toEqual({ kind, day, revision: queuedRevision })
  })

  it.each([undefined, 'not-a-day'])(
    'rejects missing or malformed source day %s before work',
    async day => {
      const handler = reportingHandlers.find(
        entry => entry.job.name === REPORTING_CHANGED_DAY_JOB.name,
      )!
      const job = { data: { kind: 'growth', day, revision: crypto.randomUUID() } } as Job
      await expect(handler.handle(job)).rejects.toThrow('Reporting source day required')
    },
  )
})
