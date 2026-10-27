import { randomInt } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { enqueueCleanupPartitions, enqueueCreatePartitions } from './enqueues.mts'
import { psql } from './queues.mts'

describe('classifier partition admissions', () => {
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

    await enqueueCreatePartitions(range)
    await enqueueCreatePartitions(range)
    await enqueueCleanupPartitions(range)
    const [create, retire] = await Promise.all([psql.getJob(createId), psql.getJob(retireId)])
    expect(create).toMatchObject({ id: createId, data: { classifierRange: range } })
    expect(retire).toMatchObject({ id: retireId, data: { classifierRange: range } })
    expect(create?.opts.ordering).toEqual({ key: 'classifier_partitions', concurrency: 1 })
    expect(retire?.opts.ordering).toEqual({ key: 'classifier_partitions', concurrency: 1 })
  })
})
