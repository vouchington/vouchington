import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser, insertTestUrlDirect } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  insertTestReconciliationRevisionClocks,
  insertTestReconciliationUrlClocks,
} from '@voucha/test-helpers/entities/reconciliation-revisions'
import { entityReconciliationConfig } from './work-limits.mts'
import {
  streamEntityReconciliationCandidateBatches,
  type EntityReconciliationCandidate,
} from './reconciliation.mts'

async function collect(window: { start: Date; end: Date }, after?: EntityReconciliationCandidate) {
  const rows: EntityReconciliationCandidate[] = []
  let hasMore = false
  for await (const batch of streamEntityReconciliationCandidateBatches(window, {
    after,
    onComplete: result => {
      hasMore = result.hasMore
    },
  }))
    rows.push(...batch)
  return { rows, hasMore }
}

describe('exact entity reconciliation continuation', () => {
  it('resumes revision timestamp ties without loss', async () => {
    const actor = await createTestUser()
    const post = await createTestPost({ user: actor })
    const msecs = Date.now()
    const clocks = await insertTestReconciliationRevisionClocks(post.id, actor.id, msecs)
    expect(clocks).toHaveLength(2)
    expect(clocks[0]!.epoch_us).toBe(clocks[1]!.epoch_us)
    overrideDynamicConfigFieldsForTest(entityReconciliationConfig, {
      batch_size: 1,
      max_rows_per_run: 1,
    })
    const window = { start: new Date(msecs), end: new Date(msecs + 1) }
    const first = await collect(window)
    expect(first.rows.map(row => row.changeId)).toEqual([clocks[0]!.id])
    expect(first.hasMore).toBe(true)
    const second = await collect(window, first.rows[0])
    expect(second.rows.map(row => row.changeId)).toEqual([clocks[1]!.id])
    expect(second.hasMore).toBe(false)
    // A NULL-last cursor skips earlier non-NULL changes sharing the exact prefix.
    expect((await collect(window, { ...first.rows[0]!, changeId: undefined })).rows).toEqual([])
  })

  it('preserves a one-microsecond difference within one JavaScript millisecond', async () => {
    const actor = await createTestUser()
    const url = (await insertTestUrlDirect(
      actor.id,
      `https://precise-${actor.id}.example.com/base`,
    ))!
    const msecs = Date.now()
    const clocks = await insertTestReconciliationUrlClocks(url.hostname.id, actor.id, msecs)
    expect(BigInt(clocks[2]!.epoch_us) - BigInt(clocks[0]!.epoch_us)).toBe(1n)
    expect(BigInt(clocks[2]!.epoch_us) / 1000n).toBe(BigInt(clocks[0]!.epoch_us) / 1000n)
    overrideDynamicConfigFieldsForTest(entityReconciliationConfig, {
      batch_size: 1,
      max_rows_per_run: 1,
    })
    const window = { start: new Date(msecs), end: new Date(msecs + 1) }
    const first = await collect(window)
    const second = await collect(window, first.rows[0])
    const third = await collect(window, second.rows[0])
    expect([...first.rows, ...second.rows, ...third.rows].map(row => row.entityId)).toEqual(
      clocks.map(row => row.id),
    )
    expect(third.hasMore).toBe(false)
  })

  it('orders a NULL change after a non-NULL cursor with the same prefix', async () => {
    const user = await createTestUser()
    const window = { start: new Date(Date.now() - 10000), end: new Date(Date.now() + 1000) }
    overrideDynamicConfigFieldsForTest(entityReconciliationConfig, {
      batch_size: 100,
      max_rows_per_run: 10000,
    })
    const candidate = (await collect(window)).rows.find(row => row.entityId === user.id)!
    expect(candidate).toBeDefined()
    const afterNonNull = { ...candidate, changeId: user.id }
    expect((await collect(window, afterNonNull)).rows.some(row => row.entityId === user.id)).toBe(
      true,
    )
    expect((await collect(window, candidate)).rows.some(row => row.entityId === user.id)).toBe(
      false,
    )
  })
})
