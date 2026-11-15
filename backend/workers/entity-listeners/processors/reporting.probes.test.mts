import { reconcileEntityBatches } from './reconciliation-batches.mts'
import type { ReconcileEntityData } from '@queues/entity-listeners/types'
import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { readTestReportingJobsByRevision } from '@voucha/test-helpers/reporting-daily-rollups'
import {
  enqueueReportingChangedDays,
  enqueueReportingJob,
  enqueueReportingMaterialization,
} from '@queues/background/enqueues/reporting'
import {
  REPORTING_CHANGED_DAY_JOB,
  REPORTING_DAILY_JOB,
} from '@queues/background/enqueues/reporting-jobs'
import { enqueueReconciledReportingDays, reconcileEntity } from './reconciliation.mts'
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

    const bulkRevision = crypto.randomUUID()
    await enqueueReportingChangedDays([
      { kind: 'growth', day, revision: bulkRevision },
      { kind: 'moderator_workload', day, revision: bulkRevision },
    ])
    await enqueueReportingChangedDays([
      { kind: 'growth', day, revision: bulkRevision },
      { kind: 'moderator_workload', day, revision: bulkRevision },
    ])
    const bulk = await readTestReportingJobsByRevision(bulkRevision)
    expect(bulk).toHaveLength(2)
    expect(new Set(bulk.map(job => job.id)).size).toBe(2)
    expect(bulk.every(job => job.name === REPORTING_CHANGED_DAY_JOB.name)).toBe(true)

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

  it('bulk admits the latest bounded source tuple and admits a later revision', async () => {
    const day = '2000-01-03'
    const first: ReconcileEntityData = {
      entityType: 'reporting_growth',
      entityId: day,
      changedAtEpochUs: '946857600000000',
      changeId: crypto.randomUUID(),
    }
    const latest: ReconcileEntityData = {
      ...first,
      changedAtEpochUs: '946857600000001',
      changeId: crypto.randomUUID(),
    }
    const later: ReconcileEntityData = {
      ...first,
      changedAtEpochUs: '946857600000003',
      changeId: crypto.randomUUID(),
    }
    const firstRevision = `${first.changeId}-${first.changedAtEpochUs}`
    const latestRevision = `${latest.changeId}-${latest.changedAtEpochUs}`
    const laterRevision = `${later.changeId}-${later.changedAtEpochUs}`
    const source = {
      async *[Symbol.asyncIterator]() {
        yield [first]
        yield [latest]
      },
    }
    await reconcileEntityBatches(source, reconcileEntity, {
      hasMore: () => false,
      enqueueReportingDays: enqueueReconciledReportingDays,
      onMore: async () => {},
    })
    expect(await readTestReportingJobsByRevision(firstRevision)).toEqual([])
    const admitted = await readTestReportingJobsByRevision(latestRevision)
    expect(admitted).toHaveLength(1)
    expect(admitted[0]!.data).toEqual({ kind: 'growth', day, revision: latestRevision })

    // A retried bounded run retains the same actual-source identity.
    await reconcileEntityBatches(source, reconcileEntity, {
      hasMore: () => false,
      enqueueReportingDays: enqueueReconciledReportingDays,
      onMore: async () => {},
    })
    expect((await readTestReportingJobsByRevision(latestRevision)).map(job => job.id)).toEqual([
      admitted[0]!.id,
    ])
    const next = {
      async *[Symbol.asyncIterator]() {
        yield [later]
      },
    }
    await reconcileEntityBatches(next, reconcileEntity, {
      hasMore: () => false,
      enqueueReportingDays: enqueueReconciledReportingDays,
      onMore: async () => {},
    })
    const nextJobs = await readTestReportingJobsByRevision(laterRevision)
    expect(nextJobs).toHaveLength(1)
    expect(nextJobs[0]!.id).not.toBe(admitted[0]!.id)
    expect(nextJobs[0]!.data).toEqual({ kind: 'growth', day, revision: laterRevision })
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
