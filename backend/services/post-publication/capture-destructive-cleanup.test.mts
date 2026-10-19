import { createPost, updatePost } from '@services/posts'
import { hardDeleteRssFeedById } from '@services/rss-feeds/delete.mts'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  WEB_PROVENANCE,
  addTestPostDataPointTopic,
  createActivePostTopicAliasRelationForTest,
  createRandomString,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  getTestPostPublicationDirtyWorkForScope,
  hardDeleteTestPost,
  hardDeleteTestPosts,
  insertTestRssFeedDirect,
  insertTestStoryCategoryPublicationBatch,
  insertTestUrlDirect,
  listTestPostPublicationRetainedTextKeys,
} from '@voucha/test-helpers'
import { onceElectionVoteStatsCompleted } from '@voucha/test-helpers/election-vote-stats'
import { seedTestPublicationReceipt } from '@voucha/test-helpers/entities/post-publication-snapshots'
import { reconcileTestPublicationUntilSnapshotsComplete } from '@voucha/test-helpers/post-publication-fixtures'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acknowledgePostPublicationProjectionReceipts,
  claimPostPublicationDirtyWork,
} from './public.mts'

describe('destructive publication cleanup', () => {
  it('retains subtree keys before a post with no receipt is hard-deleted', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({
      user,
      name: `Hard delete topic ${createRandomString(8)}`,
    })
    const post = await createTestPost({
      user,
      title: `Hard delete ${createRandomString(8)}`,
      slug: `hard-delete-${createRandomString(8)}`,
    })
    if (!post?.slug) throw new Error('Expected hard-delete post')
    await addTestPostDataPointTopic(post.id, topic.id)

    await hardDeleteTestPost(post.id)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    if (!work) throw new Error('Expected hard-delete publication work')
    await expect(
      listTestPostPublicationRetainedTextKeys(work.id, 'identity_post_slug'),
    ).resolves.toEqual([post.slug])
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected hard-delete lease')
    const reconciliation = await reconcileTestPublicationUntilSnapshotsComplete(claimed)
    expect(reconciliation.missingPostIds).toContain(post.id)
    expect(reconciliation.topicIds).toContain(topic.id)
    expect(reconciliation.identityKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'post_slug', value: post.slug })]),
    )
    expect(reconciliation.sitemapTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          postType: 'discussion',
          day: post.created_at.toISOString().slice(0, 10),
        }),
      ]),
    )
  })

  it('purges a received post from the receipt after the row is hard-deleted', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user, name: `Receipt delete ${createRandomString(8)}` })
    const post = await createTestPost({
      user,
      title: `Receipt delete ${createRandomString(8)}`,
      slug: `receipt-delete-${createRandomString(8)}`,
    })
    if (!post?.slug) throw new Error('Expected received post')
    await seedTestPublicationReceipt(post.id, 'hard-delete-receipt', {
      topicIds: [topic.id],
      identityKeys: [{ kind: 'post_slug', value: post.slug }],
      sitemapTargets: [{ postType: 'discussion', day: '2026-10-18' }],
    })

    await hardDeleteTestPost(post.id)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    if (!work) throw new Error('Expected received hard-delete work')
    await expect(
      listTestPostPublicationRetainedTextKeys(work.id, 'identity_post_slug'),
    ).resolves.toEqual([])
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected received hard-delete lease')
    const reconciliation = await reconcileTestPublicationUntilSnapshotsComplete(claimed)
    expect(reconciliation.missingPostIds).toContain(post.id)
    expect(reconciliation.topicIds).toContain(topic.id)
    expect(reconciliation.identityKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'post_slug', value: post.slug })]),
    )
    expect(reconciliation.sitemapTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ postType: 'discussion', day: '2026-10-18' }),
      ]),
    )
  })

  it('purges the previous slug from the receipt when a post is renamed', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const suffix = createRandomString(8).toLowerCase()
    const created = await createPost(author, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Publication rename ${suffix}`,
      slug: `publication-old-${suffix}`,
    })
    if (!created?.slug) throw new Error('Expected renamed post')
    onTestFinished(() => hardDeleteTestPosts([created.id]))
    await onceElectionVoteStatsCompleted({ electionId: created.id, orderingKey: 'post' })
    const createdWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: created.id,
    })
    if (!createdWork) throw new Error('Expected create publication work')
    const createdLease = await claimPostPublicationDirtyWork(createdWork, 60)
    if (!createdLease) throw new Error('Expected create publication lease')
    const published = await reconcileTestPublicationUntilSnapshotsComplete(createdLease)
    await expect(
      acknowledgePostPublicationProjectionReceipts(createdLease, published.posts),
    ).resolves.toBe(true)

    const nextSlug = `publication-new-${suffix}`
    const updated = await updatePost(author, created, { slug: nextSlug })
    expect(updated?.slug).toBe(nextSlug)
    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: created.id })
    if (!work) throw new Error('Expected rename publication work')
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected rename publication lease')
    const reconciliation = await reconcileTestPublicationUntilSnapshotsComplete(claimed)
    expect(reconciliation.posts.map(post => post.id)).toContain(created.id)
    expect(reconciliation.identityKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'post_slug', value: created.slug })]),
    )
  })

  it('cleans the old alias cache key, topic, and post sitemap when an ordinary alias is deleted', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Alias cleanup ${createRandomString(8)}` })
    const [alias] = await createTopicAliases(topic.id, `alias cleanup ${createRandomString(8)}`)
    if (!alias) throw new Error('Expected ordinary alias')
    const post = await createTestPost({ user, title: `Alias cleanup ${createRandomString(8)}` })
    if (!post) throw new Error('Expected alias post')
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
    })

    await unlinkTopicAlias(alias.id)

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    if (!work) throw new Error('Expected alias deletion work')
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected alias deletion lease')
    const reconciliation = await reconcileTestPublicationUntilSnapshotsComplete(claimed)
    expect(reconciliation.topicIds).toContain(topic.id)
    expect(reconciliation.identityKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'topic_alias', value: alias.alias }),
      ]),
    )
    expect(reconciliation.sitemapTargets).toEqual(
      expect.arrayContaining([expect.objectContaining({ postType: post.post_type })]),
    )
  })

  it('cleans feed cache keys, topics, and story sitemap shards when an RSS feed is hard-deleted', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user, name: `Feed cleanup ${createRandomString(8)}` })
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const url = await insertTestUrlDirect(user.id, `https://example.com/${createRandomString(10)}`)
    if (!url) throw new Error('Expected feed cleanup URL')
    const { postIds } = await insertTestStoryCategoryPublicationBatch({
      count: 1,
      categoryText: 'feed-cleanup',
      createdById: user.id,
      rssFeedId: feed.id,
      topicId: topic.id,
      urlId: url.id,
    })
    onTestFinished(() => hardDeleteTestPosts(postIds))

    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    if (!work) throw new Error('Expected feed hard-delete work')
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected feed hard-delete lease')
    const reconciliation = await reconcileTestPublicationUntilSnapshotsComplete(claimed)
    expect(reconciliation.topicIds).toContain(topic.id)
    expect(reconciliation.identityKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'rss_feed', value: feed.id })]),
    )
    expect(reconciliation.sitemapTargets).toEqual(
      expect.arrayContaining([expect.objectContaining({ postType: 'story' })]),
    )
  })
})
