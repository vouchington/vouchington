import { getTopicIdByAnyCached } from '@services/entity-cache/lookups'
import { randomUUID } from 'node:crypto'
import { getTopicCacheKeys } from '@services/entity-cache/keys'
import { createTestTopic, createTestUser, getTopicRevisionsForTest } from '@voucha/test-helpers'

import { describe, expect, it } from 'vitest'
import { createTopicAliases } from './aliases.mts'
import { getTopicAliasesForTest } from '@voucha/test-helpers/topic-aliases'
import { getTopicByAny, getTopicByAnyWithRedirect, getTopicBySlug } from './get.mts'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import { createTopicMergeOperation, getTopicMergeOperation } from './merge-operations.mts'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'
import { getTopicIds } from './search/get-ids.mts'
import type { Topic } from './types.mts'

async function createFullTestTopic(options: Parameters<typeof createTestTopic>[0]): Promise<Topic> {
  const topic = await createTestTopic(options)
  const fullTopic = await getTopicByAny(topic.id)
  if (!fullTopic) throw new Error(`Test topic not found: ${topic.id}`)
  return fullTopic
}

describe('mergeTopicAliases', () => {
  it('records the destination complete alias transition in merge revisions', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({
      user: admin,
      name: `Revision source ${randomUUID()}`,
    })
    const destination = await createFullTestTopic({
      user: admin,
      name: `Revision destination ${randomUUID()}`,
    })
    const sourceAlias = `revision-source-${Math.random().toString(36).slice(2, 8)}`
    const destinationAlias = `revision-destination-${Math.random().toString(36).slice(2, 8)}`
    await createTopicAliases(source.id, sourceAlias)
    await createTopicAliases(destination.id, destinationAlias)

    await mergeTopicAliases(admin, source, destination)

    const revision = (await getTopicRevisionsForTest(destination.id)).at(-1)
    expect(revision?.changes.changes).toEqual({
      topic_aliases: {
        before: [destinationAlias],
        after: [destinationAlias, source.slug, sourceAlias].toSorted(),
      },
    })
  })

  it('moves aliases, adds the source slug, and marks the source merged', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({
      user: admin,
      name: `Source Topic ${Math.random().toString(36).slice(2, 8)}`,
      topic_type: 'topic',
    })
    const destination = await createFullTestTopic({
      user: admin,
      name: `Destination Topic ${Math.random().toString(36).slice(2, 8)}`,
      topic_type: 'topic',
    })
    const sourceAlias = `source-alias-${Math.random().toString(36).slice(2, 8)}`
    await createTopicAliases(source.id, sourceAlias)

    const merge = await mergeTopicAliases(admin, source, destination)

    expect(merge.source_topic_id).toBe(source.id)
    expect(merge.destination_topic_id).toBe(destination.id)
    expect(merge.destination_topic.id).toBe(destination.id)
    expect(merge.moved_aliases).toEqual(expect.arrayContaining([source.slug, sourceAlias]))
    await expect(getTopicAliasesForTest(source.id)).resolves.toEqual({
      results: [],
      hasNextPage: false,
    })
    const { results: destinationAliases } = await getTopicAliasesForTest(destination.id)
    expect(destinationAliases).toEqual(expect.arrayContaining([source.slug, sourceAlias]))

    const redirectedSource = await getTopicByAnyWithRedirect(source.id)
    expect(redirectedSource?.topic.id).toBe(destination.id)
    expect(redirectedSource?.topic_redirect?.source_topic_id).toBe(source.id)
  })

  it('resolves source identifiers to the destination with redirect metadata', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({
      user: admin,
      name: `Redirect Source ${randomUUID()}`,
    })
    const destination = await createFullTestTopic({
      user: admin,
      name: `Redirect Destination ${randomUUID()}`,
    })
    const sourceAlias = `redirect-source-alias-${Math.random().toString(36).slice(2, 8)}`
    await createTopicAliases(source.id, sourceAlias)
    await expect(getTopicIdByAnyCached(source.id)).resolves.toBe(source.id)

    await mergeTopicAliases(admin, source, destination)

    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: destination.id })
    await expect(getTopicByAny(source.slug)).resolves.toMatchObject({ id: destination.id })
    await expect(getTopicBySlug(source.slug)).resolves.toMatchObject({ id: destination.id })
    await expect(getTopicByAny(sourceAlias)).resolves.toMatchObject({ id: destination.id })
    await expect(getTopicIdByAnyCached(source.id)).resolves.toBe(destination.id)
    await expect(getTopicIdByAnyCached(source.slug)).resolves.toBe(destination.id)

    const redirected = await getTopicByAnyWithRedirect(source.slug)
    expect(redirected?.topic.id).toBe(destination.id)
    expect(redirected?.topic_redirect).toMatchObject({
      source_topic_id: source.id,
      source_topic_slug: source.slug,
      destination_topic_id: destination.id,
    })

    await expect(getTopicCacheKeys(destination.id)).resolves.toEqual(
      expect.arrayContaining([source.id, source.slug, destination.id, destination.slug]),
    )
  })

  it('excludes merged source topics from search results', async () => {
    const admin = await createTestUser({ administrator: true })
    const marker = `merged-search-${Math.random().toString(36).slice(2, 8)}`
    const source = await createFullTestTopic({ user: admin, name: `Source ${marker}` })
    const destination = await createFullTestTopic({ user: admin, name: `Destination ${marker}` })

    await mergeTopicAliases(admin, source, destination)

    const result = await getTopicIds({ text_search_query: marker, limit: 20 })
    const ids = result.results.map(topic => topic.id)
    expect(ids).toContain(destination.id)
    expect(ids).not.toContain(source.id)
  })

  it('rejects self, already-merged source, merged destination, and non-admin users', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const source = await createFullTestTopic({
      user: admin,
      name: `Conflict Source ${randomUUID()}`,
    })
    const destination = await createFullTestTopic({
      user: admin,
      name: `Conflict Destination ${randomUUID()}`,
    })
    const other = await createFullTestTopic({ user: admin, name: `Conflict Other ${randomUUID()}` })

    await expect(mergeTopicAliases(admin, source, source)).rejects.toMatchObject({ status: 409 })
    await expect(mergeTopicAliases(user, source, destination)).rejects.toMatchObject({
      status: 403,
    })

    await mergeTopicAliases(admin, source, destination)
    await expect(mergeTopicAliases(admin, source, other)).rejects.toMatchObject({ status: 409 })
    await expect(mergeTopicAliases(admin, destination, other)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('reserves a merge before moving aliases and applies them through committed pages', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const alias = `page-alias-${crypto.randomUUID()}`
    await createTopicAliases(source.id, alias)

    const operation = await createTopicMergeOperation(admin, source, destination)
    expect(operation.status).toBe('queued')
    expect((await getTopicAliasesForTest(source.id)).results).toContain(alias)
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })

    let generation = await processTopicMergeOperationPage(operation.id, 0)
    expect(generation).toBe(1)
    await expect(getTopicMergeOperation(admin, source.id, operation.id)).resolves.toMatchObject({
      status: 'running',
    })
    expect((await getTopicAliasesForTest(source.id)).results).toContain(alias)
    for (let page = 0; page < 2000 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(operation.id, generation)
    }
    expect(generation).toBeNull()
    await expect(getTopicMergeOperation(admin, source.id, operation.id)).resolves.toMatchObject({
      status: 'completed',
    })
    expect((await getTopicAliasesForTest(destination.id)).results).toContain(alias)
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: destination.id })
  })
})

// The 'post queryability' case (getPostIds still surfaces a merged source topic's tagged posts)
// relocated to backend/services/posts/__tests__/topic-merge-post-queryability.test.mts — @services/topics
// must not depend on @services/posts (posts already prod-deps topics, the kept direction).
