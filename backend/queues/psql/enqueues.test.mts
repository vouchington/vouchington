import { randomInt, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  enqueueCleanupPartitions,
  enqueueCleanupPartitionsContinuation,
  enqueueCreatePartitions,
} from './enqueues.mts'
import { psql } from './queues.mts'

describe('classifier partition admissions', () => {
  it('serializes scheduled and continued monthly cleanup in the same lane', async () => {
    const scheduledAdmission = await enqueueCleanupPartitions()
    const scheduledId = (scheduledAdmission as { id?: string } | null)?.id
    if (!scheduledId) throw new Error('Expected a scheduled partition cleanup job')
    const continuation = {
      rootJobId: randomUUID(),
      step: 1,
      referenceDate: '2026-10-28T00:00:00.000Z',
      after: { priority: 2, partition: 'topic_revisions__p_2025_09' },
    }
    const continuedId = `psql__partition-cleanup__${continuation.rootJobId}__${continuation.step}`
    await enqueueCleanupPartitionsContinuation(continuation)
    const [scheduled, continued] = await Promise.all([
      psql.getJob(scheduledId),
      psql.getJob(continuedId),
    ])
    onTestFinished(async () => {
      await Promise.all(
        [scheduledId, continuedId].map(async id => (await psql.getJob(id))?.remove()),
      )
    })
    expect(scheduled?.opts.ordering).toEqual({ key: 'psql:partition-cleanup', concurrency: 1 })
    expect(continued?.opts.ordering).toEqual(scheduled?.opts.ordering)
    expect(continued?.data).toEqual({ partitionContinuation: continuation })
  })

  it('uses one ordered lane and stable, operation-specific range IDs', async () => {
    const from = new Date(Date.UTC(1000, 0, 1) + randomInt(0, 360_000) * 24 * 60 * 60 * 1000)
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
    const range = {
      fromDate: from.toISOString().slice(0, 10),
      toDate: to.toISOString().slice(0, 10),
    }
    const createId = `classifier-range__create__${range.fromDate}_${range.toDate}`
    const retireId = `classifier-range__retire__${range.fromDate}_${range.toDate}`
    onTestFinished(async () => {
      await Promise.all([createId, retireId].map(async id => (await psql.getJob(id))?.remove()))
    })

    await enqueueCreatePartitions({ classifierRange: range })
    await enqueueCreatePartitions({ classifierRange: range })
    await enqueueCleanupPartitions({ classifierRange: range })
    const [create, retire] = await Promise.all([psql.getJob(createId), psql.getJob(retireId)])
    expect(create).toMatchObject({ id: createId, data: { classifierRange: range } })
    expect(retire).toMatchObject({ id: retireId, data: { classifierRange: range } })
    expect(create?.opts.ordering).toEqual({ key: 'operator_partitions', concurrency: 1 })
    expect(retire?.opts.ordering).toEqual({ key: 'operator_partitions', concurrency: 1 })
  })

  it('keeps request ranges distinct from classifier ranges in the operator lane', async () => {
    const range = { fromDate: '2020-02-01', toDate: '2020-02-02' }
    const requestId = `request-range__create__${range.fromDate}_${range.toDate}`
    const classifierId = `classifier-range__create__${range.fromDate}_${range.toDate}`
    onTestFinished(async () => {
      await Promise.all(
        [requestId, classifierId].map(async id => (await psql.getJob(id))?.remove()),
      )
    })
    await enqueueCreatePartitions({ requestRange: range })
    await enqueueCreatePartitions({ classifierRange: range })
    const [request, classifier] = await Promise.all([
      psql.getJob(requestId),
      psql.getJob(classifierId),
    ])
    expect(request).toMatchObject({ id: requestId, data: { requestRange: range } })
    expect(classifier).toMatchObject({ id: classifierId, data: { classifierRange: range } })
    expect(request?.opts.ordering).toEqual({ key: 'operator_partitions', concurrency: 1 })
  })
})
