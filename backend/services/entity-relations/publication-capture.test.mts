import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  countTestPostPublicationDirtyWorkForPosts,
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTopicAliasForTest,
  insertUnlinkedTopicAliasForTest,
  getTopicAliasIdForTest,
  getTestPostPublicationDirtyWorkForScope,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactTopicIds,
  insertTestUrlDirect,
  insertTestPostBatch,
} from '@voucha/test-helpers'
import { softDeleteEntityRelation } from './delete.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import {
  recordTestPostTopicRelationPublicationChanges,
  stubUrlGuardsForSuite,
} from './test-support.mts'
import { upsertEntityRelation } from './upsert.mts'
import { createTestRssFeed } from '../rss-feeds/test-fixtures.mts'
import { getPublisherTypeTopicId } from '../topics/publisher-type-topics.mts'

describe('post topic relation publication capture', () => {
  stubUrlGuardsForSuite()

  it('captures create, deletion, and resurrection in the relation transaction', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    await upsertEntityRelation(user, relation, post, [topic], { vote: false })
    const created = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(created).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(created!.id)).resolves.toEqual([topic.id])
    await softDeleteEntityRelation(user, relation, post, [topic])
    const deleted = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(deleted!.generation)).toBeGreaterThan(Number(created!.generation))
    await upsertEntityRelation(user, relation, post, [topic], { vote: false })
    const resurrected = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(resurrected!.generation)).toBeGreaterThan(Number(deleted!.generation))
    await expect(listTestPostPublicationImpactTopicIds(resurrected!.id)).resolves.toEqual([
      topic.id,
    ])
  })

  it('captures alias category create, deletion, and resurrection against its canonical topic', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()
    const alias = `publication-capture-${randomUUID()}`
    await insertTopicAliasForTest(topic.id, alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected test topic alias')
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic_alias',
      predicate: 'category',
    })

    await upsertEntityRelation(user, relation, post, [{ id: aliasId }], { vote: false })
    const created = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(created).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(created!.id)).resolves.toEqual([topic.id])

    await softDeleteEntityRelation(user, relation, post, [{ id: aliasId }])
    const deleted = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(deleted!.generation)).toBeGreaterThan(Number(created!.generation))

    await upsertEntityRelation(user, relation, post, [{ id: aliasId }], { vote: false })
    const resurrected = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(resurrected!.generation)).toBeGreaterThan(Number(deleted!.generation))
    await expect(listTestPostPublicationImpactTopicIds(resurrected!.id)).resolves.toEqual([
      topic.id,
    ])
  })

  it('captures an unclaimed alias category as a post change', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const alias = `publication-capture-unclaimed-${randomUUID()}`
    await insertUnlinkedTopicAliasForTest(alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected test topic alias')
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic_alias',
      predicate: 'category',
    })

    await upsertEntityRelation(user, relation, post, [{ id: aliasId }], { vote: false })

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(work).toBeDefined()
    await expect(listTestPostPublicationImpactPostIds(work!.id)).resolves.toEqual([])
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual([])
  })

  it('captures RSS item hashtag score crossings against the alias scope', async () => {
    const alias = `rss-publication-capture-${randomUUID()}`
    await insertUnlinkedTopicAliasForTest(alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected test topic alias')

    await recordTestPostTopicRelationPublicationChanges(
      'relation__rss_feed_item__category__topic_alias',
      [{ subject_id: randomUUID(), object_id: aliasId }],
    )

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliasId,
    })
    expect(work).toBeDefined()
    expect(work!.reasons).toContain('post_topics_changed')
  })

  it('captures related URL create, deletion, and resurrection as a post change', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const url = await insertTestUrlDirect(
      user.id,
      `https://publication-url-${randomUUID().slice(0, 8)}.example.com`,
    )
    if (!url) throw new Error('Expected test URL')
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })

    await upsertEntityRelation(user, relation, post, [{ id: url.id }], { vote: false })
    const created = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(created).toBeDefined()
    await expect(listTestPostPublicationImpactPostIds(created!.id)).resolves.toEqual([post.id])
    await expect(listTestPostPublicationImpactTopicIds(created!.id)).resolves.toEqual([])

    await upsertEntityRelation(user, relation, post, [{ id: url.id }], { vote: false })
    const retried = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(retried!.generation).toBe(created!.generation)

    await softDeleteEntityRelation(user, relation, post, [{ id: url.id }])
    const deleted = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(deleted!.generation)).toBeGreaterThan(Number(created!.generation))

    await upsertEntityRelation(user, relation, post, [{ id: url.id }], { vote: false })
    const resurrected = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(resurrected!.generation)).toBeGreaterThan(Number(deleted!.generation))
  })

  it('captures publisher_type create, deletion, and resurrection for affected RSS feeds', async () => {
    const user = await createTestUser({ administrator: true })
    const sourceTopic = await createTestTopic({
      hostname: `publisher-publication-${randomUUID().slice(0, 8)}.example.com`,
      topic_type: 'rss_feed',
    })
    const publisherTypeId = await getPublisherTypeTopicId('blog')
    if (!publisherTypeId) throw new Error('Expected blog publisher type')
    const feed = await createTestRssFeed({ topicId: sourceTopic.id })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })

    await upsertEntityRelation(user, relation, sourceTopic, [{ id: publisherTypeId }], {
      vote: false,
    })
    const created = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    expect(created).toBeDefined()
    expect(created!.reasons).toContain('rss_feed_discoverability_changed')

    await softDeleteEntityRelation(user, relation, sourceTopic, [{ id: publisherTypeId }])
    const deleted = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    expect(Number(deleted!.generation)).toBeGreaterThan(Number(created!.generation))

    await upsertEntityRelation(user, relation, sourceTopic, [{ id: publisherTypeId }], {
      vote: false,
    })
    const resurrected = await getTestPostPublicationDirtyWorkForScope({
      type: 'rss_feed',
      id: feed.id,
    })
    expect(Number(resurrected!.generation)).toBeGreaterThan(Number(deleted!.generation))
  })

  it('does not capture unrelated post relations', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const relatedPost = await createTestPost()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'post',
      predicate: 'related',
    })
    await upsertEntityRelation(user, relation, post, [relatedPost], { vote: false })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id }),
    ).resolves.toBeUndefined()
  })

  it('captures more than one bounded post batch without dropping work', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const postIds = await insertTestPostBatch(user.id, 501)

    await recordTestPostTopicRelationPublicationChanges(
      'relation__post__category__topic',
      postIds.map(subject_id => ({ subject_id, object_id: topic.id })),
    )

    await expect(countTestPostPublicationDirtyWorkForPosts(postIds)).resolves.toBe(postIds.length)
    const finalWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: postIds.at(-1)!,
    })
    await expect(listTestPostPublicationImpactTopicIds(finalWork!.id)).resolves.toEqual([topic.id])
  })
})
