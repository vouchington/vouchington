import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { listIncompleteFollowerDistributionIdPage } from './backfill.mts'
import { createTestIncompleteFollowerDistributions } from '@voucha/test-helpers/sql-follower-distribution'
import { followerDistributionsWorkConfig } from './work-limits.mts'

async function createOwnDistributions(count: number): Promise<string[]> {
  const sender = await createTestUser()
  const post = await createTestPost({ user: sender, privacy: 'public' })
  return createTestIncompleteFollowerDistributions(sender.id, post.id, count)
}

describe('listIncompleteFollowerDistributionIdPage', () => {
  it('pages incomplete distributions by id, never over the page size, covering each once', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(followerDistributionsWorkConfig, {
        backfill_batch_size: 2,
      }),
    )
    const own = new Set(await createOwnDistributions(3))
    const firstOwnId = [...own].toSorted()[0]!

    const seen: string[] = []
    let afterId: string | undefined = uuidBefore(firstOwnId)
    while (own.size > new Set(seen.filter(id => own.has(id))).size) {
      const page = await listIncompleteFollowerDistributionIdPage(afterId)
      expect(page.ids.length).toBeLessThanOrEqual(2)
      expect(page.ids).toEqual([...page.ids].toSorted())
      expect(page.hasMore).toBe(page.ids.length === 2)
      seen.push(...page.ids)
      if (!page.hasMore) break
      afterId = page.ids.at(-1)
    }

    const ownSeen = seen.filter(id => own.has(id))
    expect(ownSeen).toHaveLength(own.size)
    expect(new Set(ownSeen)).toEqual(own)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('starts from the first id when no cursor is given', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(followerDistributionsWorkConfig, {
        backfill_batch_size: 1,
      }),
    )
    await createOwnDistributions(1)

    const page = await listIncompleteFollowerDistributionIdPage()

    expect(page.ids).toHaveLength(1)
    expect(page.hasMore).toBe(true)
  })

  it('stops after the last incomplete distribution', async () => {
    const [id] = await createOwnDistributions(1)
    const page = await listIncompleteFollowerDistributionIdPage(id)
    expect(page.ids).not.toContain(id)
    expect(page.ids.every(other => other > id)).toBe(true)
  })
})
