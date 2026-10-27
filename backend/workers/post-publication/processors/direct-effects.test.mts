import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  insertTestRssFeedDirect,
  safeUsername,
} from '@voucha/test-helpers'
import { postPublicationQueue } from '@queues/post-publication/queues'
import { SITEMAPS_POST_DAY_JOB } from '@queues/background/enqueues/sitemaps-jobs'
import { caches } from '@services/entity-cache/caches'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import { listLivePublicationPosts } from '@services/post-publication/live-publication-posts'
import type {
  PostPublicationEffectsJobData,
  PublicationCapturedKey,
} from '@voucha/types/post-publication'
import { processApplyPostPublicationEffects } from './direct-effects.mts'
import { upsertRssFeedItems } from '../../../services/rss-feed-items/upsert.mts'

function capturedJob(
  postId: string,
  keys: PublicationCapturedKey[],
): PostPublicationEffectsJobData {
  return {
    changeId: randomUUID(),
    postId,
    scope: { type: 'post', id: postId },
    reason: 'post_author_changed',
    keys,
    keyHash: hashCapturedPublicationKeys(keys),
    chunkIndex: 0,
    scopeStart: true,
    scopeTopicKeysCaptured: false,
    keyOffset: 0,
  }
}

describe('direct post publication effects', () => {
  it('enqueues both captured old and current post-type/day sitemap targets', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: `Sitemap changes ${randomUUID()}`,
      slug: `sitemap-changes-${randomUUID()}`,
      createdById: author.id,
      markdown: 'Live review for sitemap effects.',
      postType: 'review',
    })
    const oldTarget = { postType: 'discussion', day: '2025-01-01' } as const
    const currentDay = (await listLivePublicationPosts([postId]))[0]?.sitemap_day
    if (!currentDay) throw new Error('Expected current sitemap day')
    const admitted: Array<{ id: string; data: unknown }> = []
    const onAdded = (job: { id: string; name: string; data: unknown }) => {
      if (job.name !== SITEMAPS_POST_DAY_JOB.name) return
      const target = job.data as { postType?: string; day?: string }
      if (
        (target.postType === oldTarget.postType && target.day === oldTarget.day) ||
        (target.postType === 'review' && target.day === currentDay)
      )
        admitted.push(job)
    }
    postPublicationQueue.on('added', onAdded)
    try {
      await processApplyPostPublicationEffects(
        capturedJob(postId, [
          { kind: 'impact_post', uuidValue: postId },
          { kind: 'sitemap_target', ...oldTarget },
        ]),
      )
      expect(admitted.map(job => job.data)).toEqual(
        expect.arrayContaining([oldTarget, { postType: 'review', day: currentDay }]),
      )
    } finally {
      postPublicationQueue.off('added', onAdded)
      await Promise.all(
        admitted.map(async job => (await postPublicationQueue.getJob(job.id))?.remove()),
      )
    }
  })

  it('invalidates captured old names and slugs together with the live author and post slug', async () => {
    const author = await createTestUser()
    if (!author.username) throw new Error('Test author needs a username')
    const suffix = randomUUID()
    const community = await insertTestCommunity({
      createdById: author.id,
      slug: `direct-effects-community-${suffix}`,
    })
    const currentSlug = `direct-effects-post-${suffix}`
    const postId = await insertTestPost({
      title: `Direct effects ${suffix}`,
      slug: currentSlug,
      createdById: author.id,
      communityId: community.id,
      markdown: 'Live post for old and current publication keys.',
    })
    const oldUsername = safeUsername('prior-publication-author')
    const oldCommunitySlug = `prior-publication-community-${suffix}`
    const oldPostSlug = `prior-publication-post-${suffix}`
    const oldTopicAlias = `prior-publication-topic-${suffix}`
    const keys: PublicationCapturedKey[] = [
      { kind: 'impact_post', uuidValue: postId },
      { kind: 'identity_author_username', textValue: oldUsername },
      { kind: 'identity_community_slug', textValue: oldCommunitySlug },
      { kind: 'identity_post_slug', textValue: oldPostSlug },
      { kind: 'identity_topic_alias', textValue: oldTopicAlias },
    ]
    const job = capturedJob(postId, keys)

    await Promise.all([
      caches.users_lookup.set(oldUsername, author.id),
      caches.users_lookup.set(author.username, author.id),
      caches.posts_lookup.set(oldPostSlug, postId),
      caches.posts_lookup.set(currentSlug, postId),
      caches.topics_lookup.set(oldTopicAlias, randomUUID()),
    ])
    expect(await caches.users_lookup.get(oldUsername)).toBe(author.id)
    expect(await caches.users_lookup.get(author.username)).toBe(author.id)
    expect(await caches.posts_lookup.get(oldPostSlug)).toBe(postId)
    expect(await caches.posts_lookup.get(currentSlug)).toBe(postId)
    expect(await caches.topics_lookup.get(oldTopicAlias)).not.toBeNull()

    await expect(processApplyPostPublicationEffects(job)).resolves.toEqual({ affectedPosts: 1 })
    expect(await caches.users_lookup.get(oldUsername)).toBeNull()
    expect(await caches.users_lookup.get(author.username)).toBeNull()
    expect(await caches.posts_lookup.get(oldPostSlug)).toBeNull()
    expect(await caches.topics_lookup.get(oldTopicAlias)).toBeNull()

    // Current post slugs are read in a separate bounded continuation.
    await expect(
      processApplyPostPublicationEffects({
        ...job,
        keys: [],
        continuation: {
          kind: 'post_slugs',
          subjectIds: [postId],
          subjectIndex: 0,
          after: null,
        },
      }),
    ).resolves.toEqual({ affectedPosts: 0 })
    expect(await caches.posts_lookup.get(currentSlug)).toBeNull()
  })

  it('invalidates captured identities when the post no longer exists', async () => {
    const removedPostId = randomUUID()
    const priorAuthor = await createTestUser()
    const oldUsername = safeUsername('removed-post-author')
    const oldPostSlug = `removed-post-slug-${removedPostId}`
    const keys: PublicationCapturedKey[] = [
      { kind: 'impact_post', uuidValue: removedPostId },
      { kind: 'identity_author_username', textValue: oldUsername },
      { kind: 'identity_post_slug', textValue: oldPostSlug },
    ]
    await Promise.all([
      caches.users_lookup.set(oldUsername, priorAuthor.id),
      caches.posts_lookup.set(oldPostSlug, removedPostId),
    ])
    expect(await caches.users_lookup.get(oldUsername)).toBe(priorAuthor.id)
    expect(await caches.posts_lookup.get(oldPostSlug)).toBe(removedPostId)

    await expect(
      processApplyPostPublicationEffects(capturedJob(removedPostId, keys)),
    ).resolves.toEqual({
      affectedPosts: 1,
    })
    expect(await caches.users_lookup.get(oldUsername)).toBeNull()
    expect(await caches.posts_lookup.get(oldPostSlug)).toBeNull()
  })

  it('discovers and invalidates a surviving RSS item after a feed scoped change commits', async () => {
    const feed = await insertTestRssFeedDirect({})
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: `live-effect-${randomUUID()}`,
        link: `https://example.com/live-effect-${randomUUID()}`,
        title: 'Surviving RSS item',
      },
    ])
    if (!item) throw new Error('Expected source item')
    await caches.rss_feed_items.set(item.id, 'stale item')
    expect(await caches.rss_feed_items.get(item.id)).toBe('stale item')
    const base = capturedJob(feed.id, [])
    await expect(
      processApplyPostPublicationEffects({
        ...base,
        postId: null,
        scope: { type: 'rss_feed', id: feed.id },
        continuation: {
          kind: 'rss_feed_items',
          subjectIds: [feed.id],
          subjectIndex: 0,
          after: null,
        },
      }),
    ).resolves.toEqual({ affectedPosts: 0 })
    expect(await caches.rss_feed_items.get(item.id)).toBeNull()
  })
})
