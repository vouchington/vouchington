import { describe, expect, it, onTestFinished } from 'vitest'
import { notifications } from '@queues/notifications/queues'
import {
  getTestRssFeedItemCategorySnapshotReconciliation,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { reconcileRssFeedItemCategorySnapshots } from '../category-snapshot-reconciliations.mts'
import { upsertRssFeedItems } from '../upsert.mts'

function itemInput(suffix: string, categories: string[], title = 'Initial title') {
  return {
    categories,
    guid: `category-snapshot-change-${suffix}`,
    link: `https://category-snapshot-change-${suffix}.example.com/item`,
    title,
  }
}

describe('RSS category snapshot notification identity', () => {
  it('admits one new notification job when a recreated generation has a new change id', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const feed = await insertTestRssFeedDirect({})
    const [item] = await upsertRssFeedItems(feed.id, [itemInput(suffix, [`first-${suffix}`])])
    const jobs = () =>
      notifications.searchJobs({
        name: 'notifications.processReconcileRssFeedItemNotifications',
        data: { rssFeedItemId: item!.id },
      })
    onTestFinished(async () => {
      await Promise.all((await jobs()).map(job => job.remove()))
    })
    const first = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    expect(first).toMatchObject({ generation: '1' })
    const beforeFirst = new Set((await jobs()).map(job => job.id))

    await expect(reconcileRssFeedItemCategorySnapshots(undefined, [item!.id])).resolves.toEqual({
      reconciled: 1,
    })
    const firstAdmissions = (await jobs()).filter(job => !beforeFirst.has(job.id))
    expect(firstAdmissions).toHaveLength(1)
    expect(firstAdmissions[0]!.data).toMatchObject({ changeId: first!.change_id })
    await expect(
      getTestRssFeedItemCategorySnapshotReconciliation(item!.id),
    ).resolves.toBeUndefined()

    await upsertRssFeedItems(feed.id, [itemInput(suffix, [`second-${suffix}`], 'Second snapshot')])
    const second = await getTestRssFeedItemCategorySnapshotReconciliation(item!.id)
    expect(second).toMatchObject({ generation: '1' })
    expect(second!.change_id).not.toBe(first!.change_id)
    const beforeSecond = new Set((await jobs()).map(job => job.id))

    await expect(reconcileRssFeedItemCategorySnapshots(undefined, [item!.id])).resolves.toEqual({
      reconciled: 1,
    })
    const secondAdmissions = (await jobs()).filter(job => !beforeSecond.has(job.id))
    expect(secondAdmissions).toHaveLength(1)
    expect(secondAdmissions[0]!.data).toMatchObject({ changeId: second!.change_id })
    expect(secondAdmissions[0]!.id).not.toBe(firstAdmissions[0]!.id)
    expect(secondAdmissions[0]!.data).not.toMatchObject({ changeId: first!.change_id })
  })
})
