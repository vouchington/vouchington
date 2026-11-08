import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import {
  beginTransaction,
  createActivePostTopicAliasRelationForTest,
  createTestPost,
  createTestTopic,
  createTestUser,
  markTopicAliasPendingUnlinkForTest,
} from '@voucha/test-helpers'
import { getTopicAliasUnlinkOwnerForTest } from '@voucha/test-helpers/topic-aliases'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { describe, expect, it } from 'vitest'
import { createTopicAliases, unlinkTopicAlias } from '../aliases.mts'
import { selectTopicAliasUnlinkNextPage } from '../unlink-topic-alias-page.mts'

describe('topic alias unlink race', () => {
  it('joins a concurrent unlink that marks the alias first', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Unlink race ${crypto.randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `ordinary alias ${crypto.randomUUID()}`)
    if (!alias) throw new Error('Expected ordinary alias')
    const post = await createTestPost({ user, title: `Unlink race ${crypto.randomUUID()}` })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
    })
    // A concurrent unlink commits its mark between this request's read and its own mark.
    await using transaction = await beginTransaction()
    let raced = false
    const query = new Proxy(transaction, {
      apply(target, thisArgument, argumentsList: Parameters<typeof transaction>) {
        const [input] = argumentsList
        const text = typeof input === 'string' ? input : input.text
        if (raced || !text.includes('unlinkTopicAlias mark'))
          return Reflect.apply(target, thisArgument, argumentsList)
        raced = true
        return markTopicAliasPendingUnlinkForTest(alias.alias, topic.id).then(() =>
          Reflect.apply(target, thisArgument, argumentsList),
        )
      },
    })

    let detached: Awaited<ReturnType<typeof unlinkTopicAlias>> = null
    const jobs = await captureAddedPublicationEffectsForScope(alias.id, async () => {
      detached = await unlinkTopicAlias(alias.id, { query, expectedTopicId: topic.id })
      await transaction.commit()
    })

    expect(detached).toEqual({ id: alias.id, alias: alias.alias, topic_id: null })
    expect(jobs).toEqual([])
    await expect(getTopicAliasUnlinkOwnerForTest(alias.id)).resolves.toEqual({
      topic_id: null,
      unlink_topic_id: topic.id,
    })
    await using lookup = await beginTransaction()
    const page = await selectTopicAliasUnlinkNextPage(lookup, alias.id, false)
    await lookup.rollback()
    await expect(
      rssFeedMaintenance.getJob(
        `unlink-topic-alias__${page.topicAliasId}__${page.phase}__${page.pageCursor}`,
      ),
    ).resolves.toMatchObject({ data: { topicAliasId: alias.id, phase: page.phase } })
  })
})
