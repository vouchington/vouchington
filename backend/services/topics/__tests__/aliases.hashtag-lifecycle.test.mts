import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestTopic, softDeleteTopic } from '@voucha/test-helpers'
import {
  createTopicAliases,
  createUnlinkedTopicAlias,
  linkTopicAlias,
  unlinkTopicAlias,
} from '../aliases.mts'
import { getTopicAliases } from '../get-topic-aliases.mts'
import { getTopicByAny } from '../get.mts'
import { updateTopic } from '../update.mts'

describe('topic alias hashtag lifecycle', () => {
  it('claims an unlinked hashtag alias and preserves stable identity when unlinking', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Hashtag Topic ${suffix}`,
      slug: `hashtag-topic-${suffix}`,
      createdById: user!.id,
    })
    const alias = await createUnlinkedTopicAlias(`#Hashtag_${suffix}`)
    const linked = await linkTopicAlias(topicId, alias.id)
    const unlinked = await unlinkTopicAlias(alias.id)

    expect(linked).toMatchObject({ id: alias.id, topic_id: topicId })
    expect(unlinked).toMatchObject({ id: alias.id, topic_id: null, alias: `hashtag-${suffix}` })
  })

  it('maintains topic slugs as aliases while retaining the prior slug', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Slug Alias Topic ${suffix}`,
      slug: `slug-alias-${suffix}`,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    const nextSlug = `slug-alias-next-${suffix}`
    await updateTopic(user!, topic!, { slug: nextSlug })
    const { results } = await getTopicAliases(topicId)

    expect(results).toEqual(expect.arrayContaining([`slug-alias-${suffix}`, nextSlug]))
  })

  it('does not link an alias to a deleted topic', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Deleted Topic ${suffix}`,
      slug: `deleted-topic-${suffix}`,
      createdById: user!.id,
    })
    const alias = await createUnlinkedTopicAlias(`#Deleted_${suffix}`)
    await softDeleteTopic(topicId, user!.id)

    await expect(linkTopicAlias(topicId, alias.id)).rejects.toMatchObject({ status: 404 })
  })

  it('reclaims an alias from a deleted topic', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const deletedTopicId = await insertTestTopic({
      name: `Deleted Alias Owner ${suffix}`,
      slug: `deleted-alias-owner-${suffix}`,
      createdById: user!.id,
    })
    const destinationTopicId = await insertTestTopic({
      name: `Alias Destination ${suffix}`,
      slug: `alias-destination-${suffix}`,
      createdById: user!.id,
    })
    const [alias] = await createTopicAliases(deletedTopicId, `reclaim-${suffix}`)
    await softDeleteTopic(deletedTopicId, user!.id)

    const linked = await linkTopicAlias(destinationTopicId, alias!.id)

    expect(linked).toMatchObject({ id: alias!.id, topic_id: destinationTopicId })
    await expect(getTopicAliases(deletedTopicId)).resolves.toMatchObject({ results: [] })
  })

  it('does not reclaim an alias from another active topic', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const ownerTopicId = await insertTestTopic({
      name: `Active Alias Owner ${suffix}`,
      slug: `active-alias-owner-${suffix}`,
      createdById: user!.id,
    })
    const destinationTopicId = await insertTestTopic({
      name: `Active Alias Destination ${suffix}`,
      slug: `active-alias-destination-${suffix}`,
      createdById: user!.id,
    })
    const [alias] = await createTopicAliases(ownerTopicId, `active-owner-${suffix}`)

    await expect(linkTopicAlias(destinationTopicId, alias!.id)).rejects.toMatchObject({
      status: 409,
    })
    await expect(getTopicAliases(ownerTopicId)).resolves.toMatchObject({
      results: expect.arrayContaining([`active-owner-${suffix}`]),
    })
  })
})
