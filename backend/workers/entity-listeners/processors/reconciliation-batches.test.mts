import { describe, expect, it } from 'vitest'
import type { ReconcileEntityData } from '@queues/entity-listeners/types'
import { reconcileEntityBatches } from './reconciliation-batches.mts'

describe('bounded reporting reconciliation', () => {
  it('defers reporting until all batches are read and retains the latest source tuple per kind/day', async () => {
    const prefix: ReconcileEntityData = {
      entityType: 'user',
      entityId: 'user-a',
      changedAtEpochUs: '1',
    }
    const first: ReconcileEntityData = {
      entityType: 'reporting_growth',
      entityId: '2000-01-01',
      changedAtEpochUs: '2',
      changeId: 'a',
    }
    const ordinary: ReconcileEntityData = {
      entityType: 'topic',
      entityId: 'topic-a',
      changedAtEpochUs: '3',
    }
    const latest: ReconcileEntityData = { ...first, changedAtEpochUs: '4', changeId: 'b' }
    const workload: ReconcileEntityData = {
      ...first,
      entityType: 'reporting_workload',
      changedAtEpochUs: '5',
      changeId: 'c',
    }
    const anotherDay: ReconcileEntityData = {
      ...first,
      entityId: '2000-01-02',
      changedAtEpochUs: '6',
      changeId: 'd',
    }
    const processed: ReconcileEntityData[] = []
    const checkpoints: (ReconcileEntityData | undefined)[] = []
    const source = {
      async *[Symbol.asyncIterator]() {
        yield [prefix, first, ordinary]
        expect(processed).toEqual([prefix, ordinary])
        yield [latest, workload, anotherDay]
        expect(processed).toEqual([prefix, ordinary])
      },
    }
    await expect(
      reconcileEntityBatches(
        source,
        async candidate => {
          processed.push(candidate)
        },
        {
          hasMore: () => true,
          onMore: async after => {
            checkpoints.push(after)
          },
        },
      ),
    ).resolves.toEqual({ reconciled: 6, hasMore: true })
    expect(processed).toEqual([prefix, ordinary, latest, workload, anotherDay])
    expect(checkpoints).toEqual([anotherDay])
  })

  it('pins the predecessor when a later day admission fails after a partial flush', async () => {
    const prefix: ReconcileEntityData = {
      entityType: 'user',
      entityId: 'user-a',
      changedAtEpochUs: '1',
    }
    const first: ReconcileEntityData = {
      entityType: 'reporting_growth',
      entityId: '2000-01-01',
      changedAtEpochUs: '2',
      changeId: 'a',
    }
    const failed: ReconcileEntityData = {
      ...first,
      entityId: '2000-01-02',
      changedAtEpochUs: '3',
      changeId: 'b',
    }
    const latest: ReconcileEntityData = { ...first, changedAtEpochUs: '4', changeId: 'c' }
    const admitted: ReconcileEntityData[] = []
    const checkpoints: (ReconcileEntityData | undefined)[] = []
    const source = {
      async *[Symbol.asyncIterator]() {
        yield [prefix, first, failed, latest]
      },
    }
    await expect(
      reconcileEntityBatches(
        source,
        async candidate => {
          if (candidate === failed) throw new Error('day admission failed')
          admitted.push(candidate)
        },
        {
          hasMore: () => false,
          onMore: async after => {
            checkpoints.push(after)
          },
        },
      ),
    ).rejects.toThrow('day admission failed')
    expect(admitted).toEqual([prefix, latest])
    expect(checkpoints).toEqual([prefix])
  })

  it('does not checkpoint past a deferred day when an ordinary entity fails', async () => {
    const prefix: ReconcileEntityData = {
      entityType: 'user',
      entityId: 'user-a',
      changedAtEpochUs: '1',
    }
    const pending: ReconcileEntityData = {
      entityType: 'reporting_growth',
      entityId: '2000-01-01',
      changedAtEpochUs: '2',
    }
    const failed: ReconcileEntityData = {
      entityType: 'topic',
      entityId: 'topic-a',
      changedAtEpochUs: '3',
    }
    const processed: ReconcileEntityData[] = []
    const checkpoints: (ReconcileEntityData | undefined)[] = []
    const source = {
      async *[Symbol.asyncIterator]() {
        yield [prefix, pending, failed]
      },
    }
    await expect(
      reconcileEntityBatches(
        source,
        async candidate => {
          if (candidate === failed) throw new Error('ordinary side effect failed')
          processed.push(candidate)
        },
        {
          hasMore: () => false,
          onMore: async after => {
            checkpoints.push(after)
          },
        },
      ),
    ).rejects.toThrow('ordinary side effect failed')
    expect(processed).toEqual([prefix])
    expect(checkpoints).toEqual([prefix])
  })

  it('rewinds to the fixed-window start when its first deferred day fails', async () => {
    const pending: ReconcileEntityData = {
      entityType: 'reporting_growth',
      entityId: '2000-01-01',
      changedAtEpochUs: '1',
    }
    const checkpoints: (ReconcileEntityData | undefined)[] = []
    const source = {
      async *[Symbol.asyncIterator]() {
        yield [pending]
      },
    }
    await expect(
      reconcileEntityBatches(
        source,
        async () => {
          throw new Error('first day failed')
        },
        {
          hasMore: () => false,
          onMore: async after => {
            checkpoints.push(after)
          },
        },
      ),
    ).rejects.toThrow('first day failed')
    expect(checkpoints).toEqual([undefined])
  })
})
