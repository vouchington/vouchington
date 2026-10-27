import { randomUUID } from 'node:crypto'
import '@services/elections-votes'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { notifications } from '@queues/notifications/queues'
import {
  getTestRssFeedItemCategorySnapshotReconciliation,
  insertTestRssFeedDirect,
  listTestRssFeedItemCategorySnapshotReconciliations,
} from '@voucha/test-helpers'
import {
  reconcileRssFeedItemCategorySnapshotRows,
  type RssFeedItemCategorySnapshotReconciliation,
} from '../category-snapshot-reconciliations.mts'
import { upsertRssFeedItems } from '../upsert.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('RSS category snapshot notification identity', () => {
  it('admits a fresh notification change after an acknowledged generation is recreated', async () => {
    const suffix = randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const input = {
      categories: [`first-${suffix}`],
      guid: suffix,
      link: `https://snapshot-${suffix}.example.com/item`,
      title: 'First snapshot',
    }
    const [item] = await upsertRssFeedItems(feed.id, [input])
    const jobs = () =>
      notifications.searchJobs({
        name: 'notifications.processReconcileRssFeedItemNotifications',
        data: { rssFeedItemId: item!.id },
      })
    onTestFinished(async () => {
      await Promise.all((await jobs()).map(job => job.remove()))
    })
    const [first] = (await listTestRssFeedItemCategorySnapshotReconciliations([
      item!.id,
    ])) as RssFeedItemCategorySnapshotReconciliation[]
    expect(first!.generation).toBe('1')
    expect(first!.change_id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    )
    const beforeFirst = new Set((await jobs()).map(job => job.id))

    await expect(reconcileRssFeedItemCategorySnapshotRows([first!])).resolves.toEqual({
      reconciled: 1,
    })
    const firstAdmissions = (await jobs()).filter(job => !beforeFirst.has(job.id))
    expect(firstAdmissions).toHaveLength(1)
    expect(firstAdmissions[0]!.data).toMatchObject({ changeId: first!.change_id })
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(item!.id),
    ).resolves.toBeUndefined()

    // Retain the first queued chain and replay its selected row with the original identity.
    const afterFirst = (await jobs()).map(job => job.id).toSorted()
    await reconcileRssFeedItemCategorySnapshotRows([first!])
    expect((await jobs()).map(job => job.id).toSorted()).toEqual(afterFirst)

    await upsertRssFeedItems(feed.id, [
      { ...input, categories: [`second-${suffix}`], title: 'Second snapshot' },
    ])
    const [second] = (await listTestRssFeedItemCategorySnapshotReconciliations([
      item!.id,
    ])) as RssFeedItemCategorySnapshotReconciliation[]
    expect(second!.generation).toBe('1')
    expect(second!.change_id).not.toBe(first!.change_id)
    const beforeSecond = new Set((await jobs()).map(job => job.id))
    await reconcileRssFeedItemCategorySnapshotRows([second!])

    const secondAdmissions = (await jobs()).filter(job => !beforeSecond.has(job.id))
    expect(secondAdmissions).toHaveLength(1)
    expect(secondAdmissions[0]!.data).toMatchObject({ changeId: second!.change_id })
    expect(secondAdmissions[0]!.id).not.toBe(firstAdmissions[0]!.id)
    expect(secondAdmissions[0]!.data).not.toMatchObject({ changeId: first!.change_id })
  })
})
