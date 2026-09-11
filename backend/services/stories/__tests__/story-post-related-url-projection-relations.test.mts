import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  createReferralProgramFixture,
  getPostRelatedUrlIds,
  getTestStoryPostProjectionReceiptCount,
  getTestStoryPostProjectionReceiptState,
  getTestStoryPostProjectionRelationStates,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
  updateUrlHostnameBlocked,
  isTestPostgresQueryWaitingForLock,
  expireTestStoryPostProjectionLeaseAfterLock,
} from '@voucha/test-helpers'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { createStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'
import { writeStoryPostRelatedUrlProjectionRelations } from '../story-post-related-url-projection-relations.mts'
import { drainPendingStoryPostRelatedUrlProjectionCrawlEffects } from '../story-post-related-url-projection-relation-safety.mts'
import {
  decideStoryPostRelatedUrlProjectionRows,
  getStoryPostRelatedUrlProjectionSourcePageForWork,
  stageStoryPostRelatedUrlProjectionReceipts,
} from '../story-post-related-url-projection-source.mts'
import {
  claimStoryPostRelatedUrlProjectionWork,
  releaseStoryPostRelatedUrlProjectionWork,
  renewStoryPostRelatedUrlProjectionWorkLease,
} from '../story-post-related-url-projection-work.mts'

describe('story post related URL projection relations', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
  })

  it('persists the initial related URL vote aggregate before acknowledging its receipt', async () => {
    const { post } = await createProjectablePost('durable-election-aggregate')

    await expect(
      reconcileStoryPostRelatedUrlProjection({ postId: post.id }),
    ).resolves.toMatchObject({
      processed: 2,
      continue: true,
    })

    await expect(getTestStoryPostProjectionRelationStates(post.id)).resolves.toEqual([
      expect.objectContaining({ relationWrittenAt: expect.any(Date), votesScoreNet: 1 }),
    ])
    await drainProjection(post.id)
  })

  it('rejects renewal that waited on the job row past wall-clock expiry', async () => {
    const { post } = await createProjectablePost('lease-lock-expiry')
    const work = await claimStoryPostRelatedUrlProjectionWork(post.id)
    if (!work) throw new Error('Expected projection work')
    await expect(renewStoryPostRelatedUrlProjectionWorkLease(work)).resolves.toBe(true)
    const locked = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const lockTransaction = expireTestStoryPostProjectionLeaseAfterLock(post.id, locked, release)
    await locked.promise
    const renewal = renewStoryPostRelatedUrlProjectionWorkLease(work)
    try {
      await vi.waitFor(
        async () =>
          expect(
            await isTestPostgresQueryWaitingForLock('renewStoryPostRelatedUrlProjectionWorkLease'),
          ).toBe(true),
        { timeout: 5_000 },
      )
    } finally {
      release.resolve()
    }
    await lockTransaction
    await expect(renewal).resolves.toBe(false)

    await drainProjection(post.id)
  })

  it('rejects a hostname block committed after receipt staging and before relation insertion', async () => {
    const { post, url } = await createProjectablePost('fenced-hostname-block')
    const work = await claimStoryPostRelatedUrlProjectionWork(post.id)
    if (!work) throw new Error('Expected projection work')
    try {
      const sourceRows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
      const decisions = await decideStoryPostRelatedUrlProjectionRows(work, sourceRows)
      expect(decisions).toEqual([expect.objectContaining({ eligible: true })])
      await expect(stageStoryPostRelatedUrlProjectionReceipts(work, decisions)).resolves.toBe(true)
      await updateUrlHostnameBlocked(url.hostname.id, true)

      await expect(writeStoryPostRelatedUrlProjectionRelations(work, decisions)).resolves.toBe(true)
      await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([])
      await expect(
        getTestStoryPostProjectionReceiptState(post.id, work.generation, url.id),
      ).resolves.toMatchObject({ eligible: false })
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(work)
      await drainProjection(post.id)
    }
  })

  it('rejects a referral rule committed after receipt staging and before relation insertion', async () => {
    const { post, url, user } = await createProjectablePost('fenced-referral-rule')
    const work = await claimStoryPostRelatedUrlProjectionWork(post.id)
    if (!work) throw new Error('Expected projection work')
    try {
      const sourceRows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
      const decisions = await decideStoryPostRelatedUrlProjectionRows(work, sourceRows)
      expect(decisions).toEqual([expect.objectContaining({ eligible: true })])
      await expect(stageStoryPostRelatedUrlProjectionReceipts(work, decisions)).resolves.toBe(true)
      const parsedUrl = new URL(url.url)
      await createReferralProgramFixture({
        createdById: user.id,
        hostname: parsedUrl.hostname,
        pathname: parsedUrl.pathname,
      })

      await expect(writeStoryPostRelatedUrlProjectionRelations(work, decisions)).resolves.toBe(true)
      await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([])
      await expect(
        getTestStoryPostProjectionReceiptState(post.id, work.generation, url.id),
      ).resolves.toMatchObject({ eligible: false })
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(work)
      await drainProjection(post.id)
    }
  })

  it('does not crawl an already-active relation in a restarted generation', async () => {
    const { post, story, url } = await createProjectablePost('skip-active-crawl')
    const first = await stageProjectionRelations(post.id)
    try {
      await expect(
        writeStoryPostRelatedUrlProjectionRelations(first.work, first.decisions, {
          enqueueBulkCrawlUrls: async () => {},
        }),
      ).resolves.toBe(true)
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(first.work)
    }
    await refreshStoryPostForStory(story.id)

    const restarted = await stageProjectionRelations(post.id)
    const crawledUrlIds: string[] = []
    try {
      await expect(
        writeStoryPostRelatedUrlProjectionRelations(restarted.work, restarted.decisions, {
          enqueueBulkCrawlUrls: async entries => {
            crawledUrlIds.push(...entries.map(entry => entry.urlId))
          },
        }),
      ).resolves.toBe(true)
      expect(crawledUrlIds).toEqual([])
      await expect(
        getTestStoryPostProjectionReceiptState(post.id, restarted.work.generation, url.id),
      ).resolves.toMatchObject({ crawlRequired: false })
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(restarted.work)
      await drainProjection(post.id)
    }
  })

  it('retries the durable crawl requirement after post-commit crawl dispatch fails', async () => {
    const { post, url } = await createProjectablePost('retry-crawl-dispatch')
    const staged = await stageProjectionRelations(post.id)
    try {
      await expect(
        writeStoryPostRelatedUrlProjectionRelations(staged.work, staged.decisions, {
          enqueueBulkCrawlUrls: async () => {
            throw new Error('crawl queue unavailable')
          },
        }),
      ).rejects.toThrow('crawl queue unavailable')
      await expect(
        getTestStoryPostProjectionReceiptState(post.id, staged.work.generation, url.id),
      ).resolves.toMatchObject({ crawlRequired: true, effectsDispatchedAt: null })

      const crawledUrlIds: string[] = []
      await expect(
        writeStoryPostRelatedUrlProjectionRelations(staged.work, staged.decisions, {
          enqueueBulkCrawlUrls: async entries => {
            crawledUrlIds.push(...entries.map(entry => entry.urlId))
          },
        }),
      ).resolves.toBe(true)
      expect(crawledUrlIds).toEqual([url.id])
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(staged.work)
      await drainProjection(post.id)
    }
  })

  it('carries a failed crawl dispatch across a projection generation restart', async () => {
    const { post, story, url } = await createProjectablePost('restart-crawl-dispatch')
    const first = await stageProjectionRelations(post.id)
    try {
      await expect(
        writeStoryPostRelatedUrlProjectionRelations(first.work, first.decisions, {
          enqueueBulkCrawlUrls: async () => {
            throw new Error('crawl queue unavailable')
          },
        }),
      ).rejects.toThrow('crawl queue unavailable')
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(first.work)
    }

    await refreshStoryPostForStory(story.id)
    const restarted = await claimStoryPostRelatedUrlProjectionWork(post.id)
    if (!restarted) throw new Error('Expected restarted projection work')
    const crawledUrlIds: string[] = []
    try {
      await expect(
        drainPendingStoryPostRelatedUrlProjectionCrawlEffects(restarted, async entries => {
          crawledUrlIds.push(...entries.map(entry => entry.urlId))
        }),
      ).resolves.toBe(1)
      expect(crawledUrlIds).toEqual([url.id])
      await expect(
        getTestStoryPostProjectionReceiptState(post.id, first.work.generation, url.id),
      ).resolves.toMatchObject({ effectsDispatchedAt: expect.any(Date) })
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(restarted)
      await drainProjection(post.id)
    }
  })

  it('cleans an undecided receipt after a projection generation restart', async () => {
    const { post, story } = await createProjectablePost('cleanup-undecided-receipt')
    const staged = await stageProjectionRelations(post.id)
    await releaseStoryPostRelatedUrlProjectionWork(staged.work)

    await refreshStoryPostForStory(story.id)
    await drainProjection(post.id)

    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(0)
  })
})

async function stageProjectionRelations(postId: string) {
  const work = await claimStoryPostRelatedUrlProjectionWork(postId)
  if (!work) throw new Error('Expected projection work')
  const sourceRows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
  const decisions = await decideStoryPostRelatedUrlProjectionRows(work, sourceRows)
  await expect(stageStoryPostRelatedUrlProjectionReceipts(work, decisions)).resolves.toBe(true)
  return { work, decisions }
}

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}

async function createProjectablePost(label: string) {
  const story = await insertTestStory({
    title: `Projection relation ${label} ${crypto.randomUUID()}`,
  })
  const url = await insertTestUrlDirect(
    null,
    `https://story-relation-${crypto.randomUUID()}.example.test/${label}/article`,
  )
  if (!url) throw new Error('Expected a public projection test URL')
  await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: url.id, count: 2 })
  const user = await createTestUserDirect()
  if (!user) throw new Error('Expected test user')
  const { post } = await createStoryPost(
    story.id,
    user,
    {},
    {
      dispatchStoryPostRelationEffects: async () => {},
      enqueueOnPostCreated: () => {},
      enqueueStoryPostAgent: async () => {},
      enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: () => {},
      invalidateStories: async () => {},
    },
  )
  return { post, story, url, user }
}
