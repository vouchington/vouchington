import { caches } from '@services/entity-cache/caches'
import { refresh } from '../../entity-fetch/refresh.mts'
import { notifications } from '@queues/notifications/queues'
import { topicAliases } from '@queues/topic-aliases/queues'
import type { PrivateUser } from '@services/users/types'
import {
  createActivePostTopicAliasRelationForTest,
  createRandomString,
  createTestPost,
  createTestUser,
  createTopHashtagPostSourceForTest,
  insertTestTopic,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  createTopicAliases,
  createUnlinkedTopicAlias,
  linkTopicAlias,
  unlinkTopicAlias,
} from '../aliases.mts'
import { getTopicByAny } from '../get.mts'
import { mergeTopicAliases } from '../merge-aliases.mts'
import { upsertTopic } from '../upsert.mts'
import { updateTopic } from '../update.mts'

describe('topic alias post-cache invalidation', () => {
  it('invalidates posts when an unlinked alias is linked and unlinked again', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Cache link topic ${suffix}`,
      slug: `cache-link-topic-${suffix}`,
      createdById: user.id,
    })
    const alias = await createUnlinkedTopicAlias(`cache-link-${suffix}`)
    const postIds = await createCachedAliasPosts(alias.id, user, suffix)
    await refresh.topic_metrics(topicId)
    expect(await caches.topic_metrics.get(topicId)).not.toBeNull()

    await linkTopicAlias(topicId, alias.id)
    await expectPostCachesInvalidated(postIds)
    expect(await caches.topic_metrics.get(topicId)).toBeNull()

    await cachePosts(postIds)

    await unlinkTopicAlias(alias.id)
    await expectPostCachesInvalidated(postIds)
  })

  it('invalidates posts when a deleted topic alias is reassigned', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const sourceTopicId = await insertTestTopic({
      name: `Cache source topic ${suffix}`,
      slug: `cache-source-topic-${suffix}`,
      createdById: user.id,
    })
    const destinationTopicId = await insertTestTopic({
      name: `Cache destination topic ${suffix}`,
      slug: `cache-destination-topic-${suffix}`,
      createdById: user.id,
    })
    const [alias] = await createTopicAliases(sourceTopicId, `cache-reassign-${suffix}`)
    const postIds = await createCachedAliasPosts(alias!.id, user, suffix)

    await softDeleteTopic(sourceTopicId, user.id)
    await linkTopicAlias(destinationTopicId, alias!.id)

    await expectPostCachesInvalidated(postIds)
  })

  it('invalidates posts when a topic merge moves their alias', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const sourceTopicId = await insertTestTopic({
      name: `Merge cache source ${suffix}`,
      slug: `merge-cache-source-${suffix}`,
      createdById: user.id,
    })
    const destinationTopicId = await insertTestTopic({
      name: `Merge cache destination ${suffix}`,
      slug: `merge-cache-destination-${suffix}`,
      createdById: user.id,
    })
    const [alias] = await createTopicAliases(sourceTopicId, `cache-merge-${suffix}`)
    const postIds = await createCachedAliasPosts(alias!.id, user, suffix)
    const [sourceTopic, destinationTopic] = await Promise.all([
      getTopicByAny(sourceTopicId),
      getTopicByAny(destinationTopicId),
    ])

    await mergeTopicAliases(user, sourceTopic!, destinationTopic!)

    await expectPostCachesInvalidated(postIds)
  })

  it('invalidates posts when upsert claims an unlinked alias', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const alias = await createUnlinkedTopicAlias(`cache-upsert-${suffix}`)
    const postIds = await createCachedAliasPosts(alias.id, user, suffix)

    await upsertTopic(`Cache upsert topic ${suffix}`, `cache-upsert-topic-${suffix}`, {
      aliases: [alias.alias],
    })

    await expectPostCachesInvalidated(postIds)
  })

  it('invalidates posts when a topic slug claims an unlinked alias', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Cache update topic ${suffix}`,
      slug: `cache-update-topic-${suffix}`,
      createdById: user.id,
    })
    const alias = await createUnlinkedTopicAlias(`cache-update-${suffix}`)
    const postIds = await createCachedAliasPosts(alias.id, user, suffix)
    const topic = await getTopicByAny(topicId)

    await updateTopic(user, topic!, { slug: alias.alias })

    await expectPostCachesInvalidated(postIds)
  })

  it('reconciles post notifications when an alias ownership changes', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Notification link topic ${suffix}`,
      slug: `notification-link-topic-${suffix}`,
      createdById: user.id,
    })
    const alias = await createUnlinkedTopicAlias(`notification-link-${suffix}`)
    const postIds = await createCachedAliasPosts(alias.id, user, suffix)

    await linkTopicAlias(topicId, alias.id)

    await expectPostNotificationReconciliationEnqueued(postIds)
  })

  it('invalidates a relation-only alias member post that has no source row', async () => {
    const suffix = createRandomString(12)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Relation cache topic ${suffix}`,
      slug: `relation-cache-topic-${suffix}`,
      createdById: user.id,
    })
    const alias = await createUnlinkedTopicAlias(`relation-cache-${suffix}`)
    const post = await createTestPost({ user, title: `Relation cache post ${suffix}` })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
    })
    await cachePosts([post.id])

    await linkTopicAlias(topicId, alias.id)

    await expectPostCachesInvalidated([post.id])
  })

  it('persists a cursor continuation after invalidating the first bounded alias-post page', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Bounded cache topic ${suffix}`,
      slug: `bounded-cache-topic-${suffix}`,
      createdById: user.id,
    })
    const alias = await createUnlinkedTopicAlias(`bounded-cache-${suffix}`)
    const postIds = await createCachedAliasPosts(alias.id, user, suffix, 101)

    await linkTopicAlias(topicId, alias.id)

    const cached = await Promise.all(postIds.map(postId => caches.posts.get(postId)))
    expect(cached.filter(value => value === null)).toHaveLength(100)
    expect(cached.filter(value => value !== null)).toHaveLength(1)
    const continuation = (await topicAliases.getJobs('waiting')).find(
      job =>
        job.name === 'processInvalidatePostsForTopicAliases' &&
        (job.data as { topicAliasIds?: string[] }).topicAliasIds?.includes(alias.id),
    )
    expect(continuation?.data).toEqual({
      afterPostId: expect.any(String),
      topicAliasIds: [alias.id],
    })
  })
})

async function createCachedAliasPosts(
  aliasId: string,
  user: PrivateUser,
  suffix: string,
  count = 2,
): Promise<string[]> {
  const posts = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      createTestPost({ user, title: `Cache alias post ${index} ${suffix}` }),
    ),
  )
  await Promise.all(
    posts.map(post =>
      createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: aliasId,
        userId: user.id,
        authoredToken: `#cache-${suffix}`,
      }),
    ),
  )
  const postIds = posts.map(post => post.id)
  await cachePosts(postIds)
  return postIds
}

async function cachePosts(postIds: string[]): Promise<void> {
  await Promise.all(postIds.map(postId => caches.posts.set(postId, { stale: true })))
  await Promise.all(
    postIds.map(async postId => expect(await caches.posts.get(postId)).not.toBeNull()),
  )
}

async function expectPostCachesInvalidated(postIds: string[]): Promise<void> {
  await expect
    .poll(async () => {
      const cached = await Promise.all(postIds.map(postId => caches.posts.get(postId)))
      return cached.every(value => value === null)
    })
    .toBe(true)
}

async function expectPostNotificationReconciliationEnqueued(postIds: string[]): Promise<void> {
  await expect
    .poll(async () => {
      const jobs = await notifications.getJobs('waiting')
      return postIds.every(postId =>
        jobs.some(
          job =>
            job.name === 'processReconcilePostNotifications' &&
            (job.data as { postId?: string }).postId === postId,
        ),
      )
    })
    .toBe(true)
}
