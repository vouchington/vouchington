import {
  readTestRssCategoryAliasTopic,
  countTestPostAliasRelations,
} from '../../../test-helpers/publication-test-queries.mts'
import {
  addTopicAliasCategoryToRssFeedItem,
  createActivePostTopicAliasRelationForTest,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  claimTopicAlias,
  createTopicAliases,
  createUnlinkedTopicAlias,
  unlinkTopicAlias,
} from '../aliases.mts'
import { recordTopicAliasPublicationChanges } from '../publication-change.mts'

describe('topic alias publication mutation', () => {
  it('rejects conflicting text for one alias identity', async () => {
    const aliasId = crypto.randomUUID()
    await expect(
      recordTopicAliasPublicationChanges(undefined as never, [
        { aliasId, alias: 'first', previousTopicId: crypto.randomUUID(), nextTopicId: null },
        { aliasId, alias: 'second', previousTopicId: null, nextTopicId: crypto.randomUUID() },
      ]),
    ).rejects.toThrow('one stable alias identity')
  })

  it('links a claimed RSS category alias to its canonical topic', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `RSS alias owner ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#rss-only-${crypto.randomUUID()}`)
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    await addTopicAliasCategoryToRssFeedItem(item.id, alias.id)

    await claimTopicAlias(topic.id, alias.alias)

    expect(await readTestRssCategoryAliasTopic(item.id, alias.id)).toBe(topic.id)
  })

  it('keeps ordinary unlink atomic while cascading a source-less post relation', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Alias owner ${crypto.randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `ordinary alias ${crypto.randomUUID()}`)
    if (!alias) throw new Error('Expected ordinary alias')
    const post = await createTestPost({ user, title: `Alias post ${crypto.randomUUID()}` })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
    })

    await unlinkTopicAlias(alias.id)

    expect(await countTestPostAliasRelations(post.id, alias.id)).toBe(0)
  })
})
