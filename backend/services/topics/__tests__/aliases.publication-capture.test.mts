import {
  addTopicAliasCategoryToRssFeedItem,
  createActivePostTopicAliasRelationForTest,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  getTestPostPublicationDirtyWorkForScope,
  insertTestPostBatch,
  insertTestPostTopicAliasSourceBatch,
  insertTestRssFeedDirect,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactTopicIds,
  listTestPostPublicationRetainedTextKeys,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  claimTopicAlias,
  createTopicAliases,
  createUnlinkedTopicAlias,
  linkTopicAlias,
  unlinkTopicAlias,
} from '../aliases.mts'
import { getTopicByAny } from '../get.mts'
import { mergeTopicAliases } from '../merge-aliases.mts'
import { recordTopicAliasPublicationChanges } from '../publication-change.mts'

describe('topic alias publication capture', () => {
  it('rejects conflicting retained text for one alias identity', async () => {
    const aliasId = crypto.randomUUID()
    await expect(
      recordTopicAliasPublicationChanges(undefined as never, [
        { aliasId, alias: 'first', previousTopicId: crypto.randomUUID(), nextTopicId: null },
        { aliasId, alias: 'second', previousTopicId: null, nextTopicId: crypto.randomUUID() },
      ]),
    ).rejects.toThrow('one stable alias identity')
  })

  it('captures an alias referenced only by an RSS item category', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `RSS alias owner ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#rss-only-${crypto.randomUUID()}`)
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    await addTopicAliasCategoryToRssFeedItem(item.id, alias.id)

    await claimTopicAlias(topic.id, alias.alias)

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    expect(work).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual([topic.id])
    await expect(listTestPostPublicationImpactPostIds(work!.id)).resolves.toEqual([])
  })

  it('retains high-fanout alias post ownership across bounded pages', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({
      user,
      name: `Bounded alias owner ${crypto.randomUUID()}`,
    })
    const alias = await createUnlinkedTopicAlias(`#bounded-${crypto.randomUUID()}`)
    const postIds = await insertTestPostBatch(user.id, 1_001)
    await insertTestPostTopicAliasSourceBatch({
      postIds,
      topicAliasId: alias.id,
      contributorId: user.id,
    })

    await claimTopicAlias(topic.id, alias.alias)

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    await expect(listTestPostPublicationImpactPostIds(work!.id)).resolves.toEqual(
      [...postIds].toSorted(),
    )
  })

  it('captures an active source-less alias relation and retains its post', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Relation owner ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#relation-${crypto.randomUUID()}`)
    const post = await createTestPost({ user, title: `Relation post ${crypto.randomUUID()}` })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
    })

    await claimTopicAlias(topic.id, alias.alias)

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual([topic.id])
    await expect(listTestPostPublicationImpactPostIds(work!.id)).resolves.toEqual([post.id])
    await expect(
      listTestPostPublicationRetainedTextKeys(work!.id, 'identity_topic_alias'),
    ).resolves.toEqual([alias.alias])
  })

  it('captures claimTopicAlias when it claims an existing unlinked alias with post sources', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Claim owner ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#claim-${crypto.randomUUID()}`)
    const post = await createTestPost({ user, title: `Claim post ${crypto.randomUUID()}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
      authoredToken: '#claim',
    })

    await claimTopicAlias(topic.id, alias.alias)

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual([topic.id])
  })

  it('captures createTopicAliases when it claims an existing unlinked alias with post sources', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Create owner ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#create-${crypto.randomUUID()}`)
    const post = await createTestPost({ user, title: `Create post ${crypto.randomUUID()}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
      authoredToken: '#create',
    })

    await createTopicAliases(topic.id, alias.alias)

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual([topic.id])
  })

  it('captures both canonical topics when relinking an alias with post sources', async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user, name: `Alias source ${crypto.randomUUID()}` })
    const destination = await createTestTopic({
      user,
      name: `Alias destination ${crypto.randomUUID()}`,
    })
    const aliasId = await createTopHashtagAliasForTest(source.id, `alias-${crypto.randomUUID()}`)
    const post = await createTestPost({ user, title: `Alias post ${crypto.randomUUID()}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: '#alias',
    })
    await softDeleteTopic(source.id, user.id)

    await linkTopicAlias(destination.id, aliasId)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'topic_alias', id: aliasId })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual(
      expect.arrayContaining([source.id, destination.id]),
    )
  })

  it('captures the prior canonical topic when unlinking an alias with post sources', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Alias owner ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#unlink-${crypto.randomUUID()}`)
    const post = await createTestPost({ user, title: `Alias post ${crypto.randomUUID()}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
      authoredToken: '#unlink',
    })
    await linkTopicAlias(topic.id, alias.id)
    const linked = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })

    await unlinkTopicAlias(alias.id)

    const unlinked = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    expect(Number(unlinked!.generation)).toBeGreaterThan(Number(linked!.generation))
    await expect(listTestPostPublicationImpactTopicIds(unlinked!.id)).resolves.toEqual(
      expect.arrayContaining([topic.id]),
    )
  })

  it('captures a source-less active relation before deleting an ordinary alias', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({
      user,
      name: `Ordinary alias owner ${crypto.randomUUID()}`,
    })
    const alias = await createUnlinkedTopicAlias(`ordinary-${crypto.randomUUID()}`)
    const post = await createTestPost({ user, title: `Ordinary alias post ${crypto.randomUUID()}` })
    await linkTopicAlias(topic.id, alias.id)
    const linked = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
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
    expect(Number(work!.generation)).toBeGreaterThan(Number(linked!.generation))
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual([topic.id])
    await expect(listTestPostPublicationImpactPostIds(work!.id)).resolves.toEqual([post.id])
  })

  it('captures both canonical topics when merging aliases with post sources', async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user, name: `Merge source ${crypto.randomUUID()}` })
    const destination = await createTestTopic({
      user,
      name: `Merge destination ${crypto.randomUUID()}`,
    })
    const aliasId = await createTopHashtagAliasForTest(source.id, `merge-${crypto.randomUUID()}`)
    const post = await createTestPost({ user, title: `Merge post ${crypto.randomUUID()}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: '#merge',
    })
    const [sourceTopic, destinationTopic] = await Promise.all([
      getTopicByAny(source.id),
      getTopicByAny(destination.id),
    ])

    await mergeTopicAliases(user, sourceTopic!, destinationTopic!)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'topic_alias', id: aliasId })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual(
      expect.arrayContaining([source.id, destination.id]),
    )
  })

  it("captures a merged topic's feeds and their independently owned category aliases", async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user, name: `Feed source ${crypto.randomUUID()}` })
    const destination = await createTestTopic({
      user,
      name: `Feed destination ${crypto.randomUUID()}`,
    })
    const categoryOwner = await createTestTopic({
      user,
      name: `Category owner ${crypto.randomUUID()}`,
    })
    const categoryAliasId = await createTopHashtagAliasForTest(
      categoryOwner.id,
      `feed-category-${crypto.randomUUID()}`,
    )
    const feed = await insertTestRssFeedDirect({ topicId: source.id })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    await addTopicAliasCategoryToRssFeedItem(item.id, categoryAliasId)
    const [sourceTopic, destinationTopic] = await Promise.all([
      getTopicByAny(source.id),
      getTopicByAny(destination.id),
    ])

    await mergeTopicAliases(user, sourceTopic!, destinationTopic!)

    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id }),
    ).resolves.toBeDefined()
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'topic_alias', id: categoryAliasId }),
    ).resolves.toBeDefined()
  })
})
