import {
  lockTopicAliasPublicationScopes,
  recordTopicMergePublicationChanges,
} from '@services/post-publication'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import { upsertRssFeedItemCategories } from '../rss-feed-items/categories.mts'
import { upsertRssFeedItems } from '../rss-feed-items/upsert.mts'
import { updateRssFeedById } from '../rss-feeds/update.mts'
import { lockTopicMergeAliasPublicationScopes } from './alias-publication-locks.mts'
import { claimTopicAlias } from './claim-topic-alias.mts'
import { unlinkTopicAlias } from './delete-topic-aliases.mts'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'
import { createTopicAliases, createUnlinkedTopicAlias } from './aliases.mts'

describe('topic alias publication locking', () => {
  it('locks an existing alias scope before claim row locks', async () => {
    expect.hasAssertions()
    const topic = await createTestTopic({ name: `Claim alias lock ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`claim-lock-${crypto.randomUUID()}`)
    await expectAliasPublicationScopeBeforeRowLock(
      alias.id,
      `SELECT id FROM topic_aliases WHERE id = $1::uuid FOR UPDATE`,
      () => claimTopicAlias(topic.id, alias.alias),
    )
  })

  it('locks an existing alias scope before create topic rows', async () => {
    expect.hasAssertions()
    const topic = await createTestTopic({ name: `Create alias lock ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`create-lock-${crypto.randomUUID()}`)
    await expectAliasPublicationScopeBeforeRowLock(
      alias.id,
      `SELECT id FROM topics WHERE id = $1::uuid FOR UPDATE`,
      () => createTopicAliases(topic.id, alias.alias),
      topic.id,
    )
  })

  it('locks an alias scope before unlink topic rows', async () => {
    expect.hasAssertions()
    const topic = await createTestTopic({ name: `Unlink alias lock ${crypto.randomUUID()}` })
    const alias = (await createTopicAliases(topic.id, `unlink-lock-${crypto.randomUUID()}`))[0]!
    await expectAliasPublicationScopeBeforeRowLock(
      alias.id,
      `SELECT id FROM topics WHERE id = $1::uuid FOR UPDATE`,
      () => unlinkTopicAlias(alias.id),
      topic.id,
    )
  })

  it('locks source alias scopes before merge topic rows', async () => {
    expect.hasAssertions()
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({
      user: admin,
      name: `Merge source ${crypto.randomUUID()}`,
    })
    const destination = await createTestTopic({
      user: admin,
      name: `Merge destination ${crypto.randomUUID()}`,
    })
    const alias = (await createTopicAliases(source.id, `merge-lock-${crypto.randomUUID()}`))[0]!
    const [sourceTopic, destinationTopic] = await Promise.all([
      getTopicByAny(source.id),
      getTopicByAny(destination.id),
    ])
    if (!sourceTopic || !destinationTopic) throw new Error('Expected merge topics')
    await expectAliasPublicationScopeBeforeRowLock(
      alias.id,
      `SELECT id FROM topics WHERE id = $1::uuid FOR UPDATE`,
      () => mergeTopicAliases(admin, sourceTopic, destinationTopic),
      destination.id,
    )
  })

  it('locks the sorted union of source and cross-category aliases', async () => {
    const admin = await createTestUser({ administrator: true })
    const [source, aliasOwner] = await Promise.all([
      createTestTopic({ user: admin, name: `Merge union source ${crypto.randomUUID()}` }),
      createTestTopic({ user: admin, name: `Merge union owner ${crypto.randomUUID()}` }),
    ])
    const [sourceAlias] = await createTopicAliases(
      source.id,
      `merge-union-source-${crypto.randomUUID()}`,
    )
    const [categoryAlias] = await createTopicAliases(
      aliasOwner.id,
      `merge-union-category-${crypto.randomUUID()}`,
    )
    const feed = await insertTestRssFeedDirect({ topicId: source.id })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: crypto.randomUUID(),
        link: `https://merge-union-${crypto.randomUUID()}.example.test/item`,
        title: 'Merge union category alias',
      },
    ])
    if (!item || !sourceAlias || !categoryAlias) throw new Error('Expected merge alias fixture')
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item.id, categories: [`#${categoryAlias.alias}`] },
    ])
    await using query = await beginTransaction()
    const scopes = await lockTopicMergeAliasPublicationScopes(query, source.id, source.slug)
    expect([...scopes.lockedAliasIds]).toEqual([sourceAlias.id, categoryAlias.id].toSorted())
    expect([...scopes.sourceAliasIds]).toEqual([sourceAlias.id])
    await query.commit()
  })

  it('retries merge when a feed reassignment adds an alias before attachment lifecycle locking', async () => {
    expect.hasAssertions()
    const admin = await createTestUser({ administrator: true })
    const [source, initialOwner, aliasOwner] = await Promise.all([
      createTestTopic({
        user: admin,
        hostname: `merge-retry-source-${crypto.randomUUID()}.example.test`,
      }),
      createTestTopic({
        user: admin,
        hostname: `merge-retry-owner-${crypto.randomUUID()}.example.test`,
      }),
      createTestTopic({ user: admin, name: `Merge retry alias owner ${crypto.randomUUID()}` }),
    ])
    const alias = (
      await createTopicAliases(aliasOwner.id, `merge-retry-category-${crypto.randomUUID()}`)
    )[0]!
    const feed = await insertTestRssFeedDirect({ topicId: initialOwner.id })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: crypto.randomUUID(),
        link: `https://merge-retry-${crypto.randomUUID()}.example.test/item`,
        title: 'Merge retry category alias',
      },
    ])
    if (!item) throw new Error('Expected RSS feed item')
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item.id, categories: [`#${alias.alias}`] },
    ])

    const discovered = Promise.withResolvers<void>()
    const continueMerge = Promise.withResolvers<void>()
    async function prepareMerge(): Promise<void> {
      await using query = await beginTransaction()
      const scopes = await lockTopicMergeAliasPublicationScopes(query, source.id, source.slug)
      discovered.resolve()
      await continueMerge.promise
      await query(
        `/* merge retry attachment lifecycle */
        SELECT pg_advisory_xact_lock(hashtextextended('topic-rss-feed-attachment:' || $1::text, 0))`,
        [source.id],
      )
      await recordTopicMergePublicationChanges(query, source.id, scopes.lockedAliasIds)
      await query.commit()
    }
    const preparedMerge = prepareMerge()
    const preparedMergeRejection = preparedMerge.catch((error: unknown) => error)
    await discovered.promise
    await updateRssFeedById(feed.id, { topic_id: source.id })
    continueMerge.resolve()
    await expect(preparedMergeRejection).resolves.toMatchObject({ status: 409 })
  })
})

async function expectAliasPublicationScopeBeforeRowLock(
  aliasId: string,
  rowLockSql: string,
  mutate: () => Promise<unknown>,
  rowLockId = aliasId,
): Promise<void> {
  const rowLocked = Promise.withResolvers<void>()
  const releaseRow = Promise.withResolvers<void>()
  async function holdRow(): Promise<void> {
    await using query = await beginTransaction()
    await query(`/* topic alias publication lock holder */ ${rowLockSql}`, [rowLockId])
    rowLocked.resolve()
    await releaseRow.promise
    await query.commit()
  }
  const holder = holdRow()
  await rowLocked.promise

  const mutation = mutate()
  try {
    await vi.waitFor(async () => {
      await expect(contendForPublicationLock()).rejects.toMatchObject({ code: '55P03' })
    })
  } finally {
    releaseRow.resolve()
  }
  await holder
  await expect(mutation).resolves.toBeDefined()

  async function contendForPublicationLock(): Promise<void> {
    await using query = await beginTransaction()
    await query(`/* topic alias publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
    await lockTopicAliasPublicationScopes(query, [aliasId])
    await query.commit()
  }
}
