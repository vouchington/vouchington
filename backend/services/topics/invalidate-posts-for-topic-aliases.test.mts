import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createActivePostTopicAliasRelationForTest,
  createTestPost,
  createTestUser,
} from '@voucha/test-helpers'
import { insertAliasInvalidationSourceForTest } from '@voucha/test-helpers/topic-alias-post-invalidation'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { caches } from '@services/entity-cache/caches'
import { notifications } from '@queues/notifications/queues'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import type { TopicAliasPostInvalidationData } from '@queues/rss-feed-maintenance/types'
import { processInvalidatePostsForTopicAliases } from '../../workers/rss-feed-maintenance/processors/topic-aliases.mts'
import { createUnlinkedTopicAlias } from './aliases.mts'
import { invalidatePostsForTopicAliases } from './invalidate-posts-for-topic-aliases.mts'
import { topicsWorkConfig } from './work-limits.mts'

describe('bounded topic-alias post invalidation', () => {
  it('immediately invalidates source-only and relation-only matches', async () => {
    const suffix = randomUUID()
    const user = await createTestUser()
    const alias = await createUnlinkedTopicAlias(`immediate-invalidation-${suffix}`)
    const sourcePost = await createTestPost({ user, title: `Source-only ${suffix}` })
    const relationPost = await createTestPost({ user, title: `Relation-only ${suffix}` })
    await Promise.all([
      insertAliasInvalidationSourceForTest(sourcePost.id, alias.id, user.id, 'explicit'),
      createActivePostTopicAliasRelationForTest({
        postId: relationPost.id,
        topicAliasId: alias.id,
        userId: user.id,
      }),
      ...[sourcePost.id, relationPost.id].map(postId => caches.posts.set(postId, { stale: true })),
    ])

    await invalidatePostsForTopicAliases([alias.id])

    await expect(caches.posts.get(sourcePost.id)).resolves.toBeNull()
    await expect(caches.posts.get(relationPost.id)).resolves.toBeNull()
  })

  it('continues tiny raw pages across source duplicates and relation-only posts', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
        alias_post_invalidation_batch_size: 1,
      }),
    )
    const suffix = randomUUID()
    const user = await createTestUser()
    const aliases = await Promise.all(
      ['first', 'second', 'excluded'].map(name =>
        createUnlinkedTopicAlias(`raw-invalidation-${name}-${suffix}`),
      ),
    )
    const includedAliases = aliases
      .slice(0, 2)
      .map(alias => alias.id)
      .toSorted()
    const posts = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createTestPost({ user, title: `Raw invalidation ${index} ${suffix}` }),
      ),
    )
    const postIds = posts.map(post => post.id).toSorted()
    const [first, second, third, fourth, excluded] = postIds as [
      string,
      string,
      string,
      string,
      string,
    ]
    await Promise.all([
      ...(['title', 'markdown', 'explicit'] as const).map(source =>
        insertAliasInvalidationSourceForTest(first, includedAliases[0]!, user.id, source),
      ),
      insertAliasInvalidationSourceForTest(fourth, includedAliases[0]!, user.id, 'explicit'),
      insertAliasInvalidationSourceForTest(first, includedAliases[1]!, user.id, 'explicit'),
      insertAliasInvalidationSourceForTest(excluded, aliases[2]!.id, user.id, 'explicit'),
      ...[first, second, third].map(postId =>
        createActivePostTopicAliasRelationForTest({
          postId,
          topicAliasId: includedAliases[0]!,
          userId: user.id,
        }),
      ),
    ])
    await Promise.all(postIds.map(postId => caches.posts.set(postId, { stale: true })))

    const changeId = randomUUID()
    const data: TopicAliasPostInvalidationData = {
      topicAliasIds: includedAliases,
      changeId,
      cursor: { topicAliasId: includedAliases[0]!, afterPostId: null },
    }
    const initial = await processInvalidatePostsForTopicAliases(data)
    expect(initial).toEqual({
      hasMore: true,
      cursor: { topicAliasId: includedAliases[0]!, afterPostId: first },
    })
    await expect(caches.posts.get(first)).resolves.toBeNull()
    await expect(caches.posts.get(second)).resolves.not.toBeNull()

    let result = initial
    for (let page = 0; page < 12 && result.cursor; page++) {
      data.cursor = result.cursor
      result = await processInvalidatePostsForTopicAliases(data)
    }
    expect(result).toEqual({ hasMore: false, cursor: null })
    const cached = await Promise.all(postIds.map(postId => caches.posts.get(postId)))
    expect(cached.slice(0, 4)).toEqual([null, null, null, null])
    expect(cached[4]).not.toBeNull()
    const jobs = await notifications.searchJobs({
      name: 'notifications.processReconcilePostNotifications',
      data: { changeId },
    })
    expect(jobs.map(job => (job.data as { postId: string }).postId).toSorted()).toEqual([
      first,
      second,
      third,
      fourth,
    ])
  })

  it('queues the next alias after an empty alias without touching excluded posts', async () => {
    const suffix = randomUUID()
    const user = await createTestUser()
    const aliases = await Promise.all(
      ['empty', 'matched'].map(name =>
        createUnlinkedTopicAlias(`empty-invalidation-${name}-${suffix}`),
      ),
    )
    const [emptyAliasId, matchedAliasId] = aliases.map(alias => alias.id).toSorted() as [
      string,
      string,
    ]
    const post = await createTestPost({ user, title: `After empty alias ${suffix}` })
    const excluded = await createTestPost({ user, title: `Excluded alias ${suffix}` })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: matchedAliasId,
      userId: user.id,
    })
    await Promise.all(
      [post.id, excluded.id].map(postId => caches.posts.set(postId, { stale: true })),
    )

    await invalidatePostsForTopicAliases([matchedAliasId, emptyAliasId, emptyAliasId])

    const jobs = await rssFeedMaintenance.searchJobs({
      name: 'processInvalidatePostsForTopicAliases',
    })
    const continuation = jobs.find(job =>
      (job.data as TopicAliasPostInvalidationData).topicAliasIds.includes(emptyAliasId),
    )
    expect(continuation?.data).toMatchObject({
      cursor: { topicAliasId: matchedAliasId, afterPostId: null },
    })
    await expect(caches.posts.get(post.id)).resolves.not.toBeNull()
    await expect(
      processInvalidatePostsForTopicAliases(continuation!.data as TopicAliasPostInvalidationData),
    ).resolves.toEqual({ hasMore: false, cursor: null })
    await expect(caches.posts.get(post.id)).resolves.toBeNull()
    await expect(caches.posts.get(excluded.id)).resolves.not.toBeNull()
  })
})
