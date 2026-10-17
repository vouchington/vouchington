import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestPost, createTestUser, followUser } from '@voucha/test-helpers'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { listIncompleteFollowerDistributionIdPage } from './backfill.mts'
import { sharePostWithFollowers } from './create.mts'
import { followerDistributionsWorkConfig } from './work-limits.mts'

async function createOwnDistribution(): Promise<string> {
  const sender = await createTestUser()
  const creator = await createTestUser()
  const follower = await createTestUser()
  await followUser(follower, sender)
  const post = await createTestPost({ user: creator, privacy: 'public' })
  return (await sharePostWithFollowers(sender, post.id)).distribution_id
}

describe('listIncompleteFollowerDistributionIdPage', () => {
  it('pages incomplete distributions by id, never over the page size, covering each once', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(followerDistributionsWorkConfig, {
        backfill_batch_size: 2,
      }),
    )
    const own = new Set(await Promise.all([1, 2, 3].map(() => createOwnDistribution())))
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
    await createOwnDistribution()

    const page = await listIncompleteFollowerDistributionIdPage()

    expect(page.ids).toHaveLength(1)
    expect(page.hasMore).toBe(true)
  })

  it('stops after the last incomplete distribution', async () => {
    const id = await createOwnDistribution()
    const page = await listIncompleteFollowerDistributionIdPage(id)
    expect(page.ids).not.toContain(id)
    expect(page.ids.every(other => other > id)).toBe(true)
  })
})
