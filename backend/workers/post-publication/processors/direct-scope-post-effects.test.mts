import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  insertTestCommunity,
  insertTestPost,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { executeTestPublicationChain } from '@voucha/test-helpers/publication-effect-chain'
import {
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  createActivePostTopicAliasRelationForTest,
  setTopHashtagPostRelationScoreForTest,
} from '@voucha/test-helpers/entities/top-hashtags'
import { insertTestPostDataTopics } from '@voucha/test-helpers/publication-test-queries'
import { insertTestStory } from '@voucha/test-helpers/entities/stories'
import { insertTestPostStory } from '@voucha/test-helpers/entities/post-stories'
import { SITEMAPS_POST_DAY_JOB } from '@queues/background/enqueues/sitemaps-jobs'
import { NOTIFICATIONS_RECONCILE_POST_JOB } from '@queues/background/enqueues/notifications-jobs'
import {
  VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB,
  VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { caches } from '@services/entity-cache/caches'
import { suspendUser } from '../../../services/users/suspension.mts'
import { updateCommunity } from '../../../services/communities/update.mts'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { processApplyPostPublicationEffects } from './direct-effects.mts'

describe('bounded live publication scope effects', () => {
  it('discovers a story post through the surviving live story relation', async () => {
    const author = await createTestUser()
    const story = await insertTestStory({ title: 'Live scoped story' })
    const slug = `live-scoped-story-${randomUUID()}`
    const postId = await insertTestPost({
      title: 'Live scoped story',
      slug,
      createdById: author.id,
      markdown: '',
      postType: 'story',
    })
    await insertTestPostStory(postId, story.id, author.id)
    await caches.posts_lookup.set(slug, postId)
    const job: PostPublicationEffectsJobData = {
      changeId: randomUUID(),
      postId: null,
      scope: { type: 'story', id: story.id },
      reason: 'post_topics_changed',
      keys: [],
      keyHash: hashCapturedPublicationKeys([]),
      chunkIndex: 0,
      scopeStart: true,
      scopeTopicKeysCaptured: false,
      keyOffset: 0,
    }
    const admitted = await executeTestPublicationChain(job, processApplyPostPublicationEffects)
    expect(admitted).toContainEqual({
      name: NOTIFICATIONS_RECONCILE_POST_JOB.name,
      data: { postId },
    })
    expect(await caches.posts_lookup.get(slug)).toBeNull()
  })
  it.each(['author', 'community'] as const)(
    'discovers every %s post beyond the page cap after the real producer commits',
    async kind => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 2 }),
      )
      const author = await createTestUser()
      const admin = await createTestUser({ administrator: true })
      const community = await insertTestCommunity({
        createdById: author.id,
        slug: `scope-${randomUUID()}`,
      })
      const topic = await createTestTopic({ hostname: `scope-${randomUUID()}.example.com` })
      const slugs = Array.from({ length: 3 }, () => `scope-post-${randomUUID()}`)
      const posts = await Promise.all(
        slugs.map(slug =>
          insertTestPost({
            title: slug,
            slug,
            createdById: author.id,
            communityId: community.id,
            markdown: 'Publication scope fixture.',
          }),
        ),
      )
      await Promise.all(posts.map((id, index) => caches.posts_lookup.set(slugs[index]!, id)))
      await insertTestPostDataTopics(posts[2]!, [topic.id])
      const jobs = await captureAddedPublicationEffectsForScope(
        kind === 'author' ? author.id : community.id,
        () =>
          kind === 'author'
            ? suspendUser(admin, author.id, 'allow')
            : updateCommunity(admin, community.id, { visibility: 'private' }),
      )
      expect(jobs.length).toBeGreaterThan(0)
      const admitted = (
        await Promise.all(
          jobs.map(job => executeTestPublicationChain(job, processApplyPostPublicationEffects)),
        )
      ).flat()
      for (const id of posts) {
        expect(admitted).toContainEqual({
          name: NOTIFICATIONS_RECONCILE_POST_JOB.name,
          data: { postId: id },
        })
        expect(admitted).toContainEqual({
          name: VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB.name,
          data: { id },
        })
      }
      expect(admitted.some(job => job.name === SITEMAPS_POST_DAY_JOB.name)).toBe(true)
      expect(admitted).toContainEqual({
        name: VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB.name,
        data: { topicId: topic.id },
      })
      expect(await Promise.all(slugs.map(slug => caches.posts_lookup.get(slug)))).toEqual([
        null,
        null,
        null,
      ])
    },
  )

  it('reaches an alias-linked authored comment and its child and grandchild without walking ancestors', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 2 }),
    )
    const author = await createTestUser()
    const other = await createTestUser()
    const topic = await createTestTopic({ hostname: `scope-alias-${randomUUID()}.example.com` })
    const alias = `scope-alias-${randomUUID()}`
    const aliasId = await createTopHashtagAliasForTest(topic.id, alias)
    const root = await insertTestPost({
      title: 'Unaffected root',
      slug: `scope-root-${randomUUID()}`,
      createdById: other.id,
      markdown: 'Root.',
    })
    const slugs = Array.from({ length: 3 }, () => `scope-comment-${randomUUID()}`)
    const inactive = await Promise.all(
      [0, 1].map(index =>
        insertTestPost({
          title: `Inactive alias ${index}`,
          slug: `inactive-alias-${randomUUID()}`,
          createdById: other.id,
          markdown: 'Inactive alias relation.',
        }),
      ),
    )
    await Promise.all(
      inactive.map(async postId => {
        await createActivePostTopicAliasRelationForTest({
          postId,
          topicAliasId: aliasId,
          userId: other.id,
        })
        await setTopHashtagPostRelationScoreForTest({ postId, topicAliasId: aliasId, score: 0 })
      }),
    )
    const comment = await insertTestPost({
      title: 'Authored comment',
      slug: slugs[0]!,
      createdById: author.id,
      markdown: 'Comment.',
      postType: 'comment',
      rootId: root,
      parentId: root,
    })
    const child = await insertTestPost({
      title: 'Child',
      slug: slugs[1]!,
      createdById: other.id,
      markdown: 'Child.',
      postType: 'comment',
      rootId: root,
      parentId: comment,
    })
    const grandchild = await insertTestPost({
      title: 'Grandchild',
      slug: slugs[2]!,
      createdById: other.id,
      markdown: 'Grandchild.',
      postType: 'comment',
      rootId: root,
      parentId: child,
    })
    await createTopHashtagPostSourceForTest({
      postId: comment,
      topicAliasId: aliasId,
      userId: author.id,
      authoredToken: alias,
    })
    const ids = [comment, child, grandchild]
    for (const scope of [
      { type: 'author' as const, id: author.id },
      { type: 'topic_alias' as const, id: aliasId },
    ]) {
      await Promise.all(ids.map((id, index) => caches.posts_lookup.set(slugs[index]!, id)))
      const job: PostPublicationEffectsJobData = {
        changeId: randomUUID(),
        postId: null,
        scope,
        reason: 'post_updated',
        keys: [],
        keyHash: hashCapturedPublicationKeys([]),
        chunkIndex: 0,
        scopeStart: true,
        scopeTopicKeysCaptured: false,
        keyOffset: 0,
      }
      const admitted = await executeTestPublicationChain(job, processApplyPostPublicationEffects)
      const notifications = admitted
        .filter(item => item.name === NOTIFICATIONS_RECONCILE_POST_JOB.name)
        .map(item => item.data)
      expect(notifications).toEqual(
        expect.arrayContaining(ids.map(postId => ({ postId, changeId: job.changeId }))),
      )
      expect(notifications).not.toContainEqual({ postId: root, changeId: job.changeId })
      for (const postId of inactive)
        expect(notifications).not.toContainEqual({ postId, changeId: job.changeId })
      expect(await Promise.all(slugs.map(slug => caches.posts_lookup.get(slug)))).toEqual([
        null,
        null,
        null,
      ])
    }
  })
})
