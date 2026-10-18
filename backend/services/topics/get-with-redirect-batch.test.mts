import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTopicAliases } from './aliases.mts'
import { mergeTopicAliases } from './merge-aliases.mts'
import { getTopicsByAnyWithRedirectBatch } from './get-with-redirect-batch.mts'
import { getTopicsByAnyBatch } from './get-batch.mts'

describe('getTopicsByAnyWithRedirectBatch', () => {
  it('preserves ordered duplicates, redirect identities, aliases and missing entries', async () => {
    const administrator = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: administrator })
    const destination = await createTestTopic({ user: administrator })
    const alias = `batch-redirect-${randomUUID()}`
    await createTopicAliases(source.id, alias)
    const [loadedSource, loadedDestination] = await getTopicsByAnyBatch([source.id, destination.id])
    if (!loadedSource || !loadedDestination) throw new Error('Expected created topics')
    await mergeTopicAliases(administrator, loadedSource, loadedDestination)

    const results = await getTopicsByAnyWithRedirectBatch([
      source.id,
      ` ${destination.slug.toUpperCase()} `,
      source.slug,
      alias,
      randomUUID(),
      source.id,
    ])
    expect(results.map(result => result?.topic.id ?? null)).toEqual([
      destination.id,
      destination.id,
      destination.id,
      destination.id,
      null,
      destination.id,
    ])
    for (const index of [0, 2, 5]) {
      expect(results[index]?.topic_redirect).toEqual({
        source_topic_id: source.id,
        source_topic_slug: source.slug,
        source_topic_type: loadedSource.topic_type,
        destination_topic_id: destination.id,
      })
    }
    expect(results[1]?.topic_redirect).toBeUndefined()
    expect(results[3]?.topic_redirect).toBeUndefined()
    expect(results[0]?.topic).not.toHaveProperty('source_topic_id')
    expect(results[0]?.topic).not.toHaveProperty('input_order')
  })

  it('returns an empty batch and rejects malformed identifiers', async () => {
    expect(await getTopicsByAnyWithRedirectBatch([])).toEqual([])
    await expect(getTopicsByAnyWithRedirectBatch(['invalid!'])).rejects.toMatchObject({
      status: 422,
      message: 'Invalid topic identifier: invalid!',
    })
  })
})
