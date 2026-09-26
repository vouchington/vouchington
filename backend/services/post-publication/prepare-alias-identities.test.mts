import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  createTestUser,
  createTestTopic,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  insertTestPostBatch,
  insertTestPostTopicAliasSourceBatch,
  insertTestPostTopicAliasRelationBatch,
  getTestPostPublicationDirtyWorkForScope,
  listTestPostPublicationImpactPostIds,
  enableQueryCapture,
  stopTestQueryCapture,
  readTestPublicationAliasStaging,
  countExistingTestPublicationAliasStages,
  readTestPublicationIdentityBridge,
} from '@voucha/test-helpers'
import {
  analyzePublicationAliasOwnersForTest,
  explainPublicationTransactionQueryForTest,
  publicationPhysicalRowsWithinBudget,
} from '@voucha/test-helpers/entities/post-publication-query-plans'
import { prepareTopicAliasPublicationIdentityBridges } from './prepare-alias-identities.mts'
import { recordTopicAliasPublicationChanges } from '../topics/publication-change.mts'

describe('transaction-private alias identity preparation', () => {
  it('globally orders crossed ownership from disjoint alias scope sets before first bridge creation', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected alias preparation author')
    const topics = await Promise.all([createTestTopic({ user }), createTestTopic({ user })])
    const posts = (await insertTestPostBatch(user.id, 2)).sort()
    const aliasTexts = Array.from({ length: 4 }, () => `prepare-${randomUUID()}`)
    const aliases = await Promise.all(
      aliasTexts.map(text => createTopHashtagAliasForTest(topics[0]!.id, text)),
    )
    await Promise.all(
      aliases.map((alias, index) =>
        createTopHashtagPostSourceForTest({
          postId: posts[[1, 0, 0, 1][index]!]!,
          topicAliasId: alias,
          userId: user.id,
          authoredToken: '#prepare',
        }),
      ),
    )
    expect(await readTestPublicationIdentityBridge('post', posts[0]!)).toBeUndefined()
    await Promise.all(
      [aliases.slice(0, 2), aliases.slice(2)].map(async aliasSet => {
        await using query = await beginTransaction()
        await recordTopicAliasPublicationChanges(
          query,
          aliasSet.map(aliasId => ({
            aliasId,
            alias: aliasTexts[aliases.indexOf(aliasId)]!,
            previousTopicId: topics[0]!.id,
            nextTopicId: topics[1]!.id,
          })),
        )
        await query.commit()
      }),
    )
    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliases[0]!,
    })
    if (!work) throw new Error('Expected prepared alias work')
    expect(await listTestPostPublicationImpactPostIds(work.id)).toEqual([posts[1]])
  })
  it('raw-caps source and staging pages in both prepared plan modes', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected alias plan author')
    const topic = await createTestTopic({ user })
    const alias = await createTopHashtagAliasForTest(topic.id, `plan-${randomUUID()}`)
    const posts = await insertTestPostBatch(user.id, 1001)
    const fixture = { postIds: posts, topicAliasId: alias, contributorId: user.id }
    await insertTestPostTopicAliasSourceBatch(fixture)
    await insertTestPostTopicAliasRelationBatch(fixture)
    await analyzePublicationAliasOwnersForTest()
    await using query = await beginTransaction()
    enableQueryCapture()
    let captured
    try {
      await prepareTopicAliasPublicationIdentityBridges(query, [alias])
    } finally {
      captured = stopTestQueryCapture()
    }
    const source = captured.filter(item =>
      item.text.includes('/* pagePublicationAliasSourceIdentities */'),
    )
    const authored = source.find(item => item.text.includes('FROM post_topic_alias_sources'))
    const relation = source.find(item =>
      item.text.includes('FROM relation__post__category__topic_alias'),
    )
    const staging = captured.find(item =>
      item.text.includes('/* pagePublicationAliasIdentityStaging */'),
    )
    if (!authored || !relation || !staging)
      throw new Error('Expected actual bounded alias source/staging SQL')
    for (const mode of ['force_custom_plan', 'force_generic_plan'] as const) {
      expect(
        publicationPhysicalRowsWithinBudget(
          await explainPublicationTransactionQueryForTest(query, authored, mode),
          'post_topic_alias_sources',
        ),
      ).toBe(100)
      expect(
        publicationPhysicalRowsWithinBudget(
          await explainPublicationTransactionQueryForTest(query, relation, mode),
          'relation__post__category__topic_alias',
        ),
      ).toBe(100)
      expect(
        publicationPhysicalRowsWithinBudget(
          await explainPublicationTransactionQueryForTest(query, staging, mode),
          'pub_alias_posts',
        ),
      ).toBe(100)
    }
  })
  it('supports repeated preparation in one transaction without leaking temporary staging', async () => {
    const topic = await createTestTopic()
    const alias = await createTopHashtagAliasForTest(topic.id, `repeat-${randomUUID()}`)
    await using query = await beginTransaction()
    await prepareTopicAliasPublicationIdentityBridges(query, [alias])
    await prepareTopicAliasPublicationIdentityBridges(query, [alias])
    const stages = await readTestPublicationAliasStaging(query)
    expect(stages).toHaveLength(2)
    await query.commit()
    expect(await countExistingTestPublicationAliasStages(stages)).toBe(0)
  })
})
