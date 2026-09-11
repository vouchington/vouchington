import { it, expect, describe } from 'vitest'
import { upsertTopic } from './upsert.mts'
import { getTopicByAny } from './get.mts'
import { getTopicAliases } from './get-topic-aliases.mts'
import {
  createTestUser,
  hasUniqueSlugIndexOnTopics,
  softDeleteTopic,
  mergeTopicForTest,
} from '@voucha/test-helpers'

describe('upsertTopic', () => {
  it('creates new topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await upsertTopic(`Test Upsert Topic ${random}`, `test-upsert-topic-${random}`)
    expect(topic).toBeDefined()
    expect(topic.name).toBe(`Test Upsert Topic ${random}`)
    expect(topic.slug).toBe(`test-upsert-topic-${random}`)
  })

  it('claims the canonical slug as a topic alias', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `canonical-upsert-alias-${random}`
    const topic = await upsertTopic(`Canonical Upsert Alias ${random}`, slug)

    await expect(getTopicAliases(topic.id)).resolves.toMatchObject({ results: [slug] })
    expect(topic.aliases).toContain(slug)
  })

  it('updates existing topic on conflict', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `test-upsert-topic-update-${random}`

    const topic1 = await upsertTopic(`Original Name ${random}`, slug)
    const topic2 = await upsertTopic(`Updated Name ${random}`, slug)

    expect(topic2.id).toBe(topic1.id)
    expect(topic2.name).toBe(`Updated Name ${random}`)
  })

  it('creates topic with aliases', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const firstAlias = `alias-one-${random}`
    const secondAlias = `alias-two-${random}`
    const topic = await upsertTopic(
      `Topic With Aliases ${random}`,
      `topic-with-aliases-${random}`,
      { aliases: [firstAlias, secondAlias] },
    )
    const { results: aliases } = await getTopicAliases(topic.id)
    expect(aliases).toContain(firstAlias)
    expect(aliases).toContain(secondAlias)
  })

  it('is idempotent - can run twice with same data', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `test-idempotent-${random}`
    const alias = `idempotent-alias-${random}`

    const topic1 = await upsertTopic(`Idempotent Topic ${random}`, slug, {
      aliases: [alias],
    })
    const topic2 = await upsertTopic(`Idempotent Topic ${random}`, slug, {
      aliases: [alias],
    })

    expect(topic2.id).toBe(topic1.id)

    const fetched = await getTopicByAny(slug)
    expect(fetched).toBeDefined()
    expect(fetched!.id).toBe(topic1.id)
  })

  it('creates topic with explicit topic_type', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await upsertTopic(`Test Card Topic ${random}`, `test-card-topic-${random}`, {
      topic_type: 'card',
    })
    expect(topic.topic_type).toBe('card')
  })

  it('has unique slug index required for ON CONFLICT (slug)', async () => {
    const hasUniqueIndex = await hasUniqueSlugIndexOnTopics()
    expect(hasUniqueIndex).toBe(true)
  })

  it('reuses an existing topic when the name already exists under a different slug', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const name = `Name Conflict Topic ${random}`
    const originalSlug = `name-conflict-original-${random}`
    const updatedSlug = `name-conflict-updated-${random}`

    const topic1 = await upsertTopic(name, originalSlug)
    const topic2 = await upsertTopic(name, updatedSlug)

    expect(topic2.id).toBe(topic1.id)
    expect(topic2.slug).toBe(updatedSlug)

    const fetched = await getTopicByAny(updatedSlug)
    expect(fetched).toBeDefined()
    expect(fetched!.id).toBe(topic1.id)
  })

  it('reuses and undeletes a soft-deleted topic when slug or name matches', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser()
    const originalSlug = `deleted-topic-${random}`
    const restoredSlug = `restored-topic-${random}`
    const name = `Deleted Topic ${random}`

    const topic1 = await upsertTopic(name, originalSlug)
    await softDeleteTopic(topic1.id, user!.id)

    const topic2 = await upsertTopic(name, restoredSlug)

    expect(topic2.id).toBe(topic1.id)
    expect(topic2.slug).toBe(restoredSlug)

    const fetched = await getTopicByAny(restoredSlug)
    expect(fetched).toBeDefined()
    expect(fetched!.id).toBe(topic1.id)
  })

  it('resolves to the destination topic when the requested slug/name belongs to a merged-away source', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser()
    const source = await upsertTopic(`Merge Source ${random}`, `merge-source-${random}`)
    const destination = await upsertTopic(`Merge Dest ${random}`, `merge-dest-${random}`)
    await mergeTopicForTest(source.id, destination.id, user!.id)

    // The source row's slug/name still occupy the unique index (merging does not rename
    // it), so re-upserting with those values must resolve to the destination rather than
    // falling through to an INSERT that collides with the source's still-unique slug/name.
    const resolved = await upsertTopic(source.name, source.slug)

    expect(resolved.id).toBe(destination.id)
    expect(resolved.name).toBe(destination.name)
    expect(resolved.slug).toBe(destination.slug)
  })

  it('resolves to the destination when the name matches it but the slug still belongs to its merged-away source', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser()
    const source = await upsertTopic(`Merge Source Name ${random}`, `merge-source-slug-${random}`)
    const destination = await upsertTopic(`Merge Dest Name ${random}`, `merge-dest-slug-${random}`)
    await mergeTopicForTest(source.id, destination.id, user!.id)

    // destination.name matches an active topic directly, but source.slug is still reserved
    // by the merged-away source row's unique index -- updating destination's slug to it
    // would violate that index. Must resolve to the destination without attempting the update.
    const resolved = await upsertTopic(destination.name, source.slug)

    expect(resolved.id).toBe(destination.id)
  })

  it('resolves to the destination when the slug matches it but the name still belongs to its merged-away source', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser()
    const source = await upsertTopic(`Merge Source Name ${random}`, `merge-source-slug-${random}`)
    const destination = await upsertTopic(`Merge Dest Name ${random}`, `merge-dest-slug-${random}`)
    await mergeTopicForTest(source.id, destination.id, user!.id)

    // destination.slug matches an active topic directly, but source.name is still reserved
    // by the merged-away source row's unique index -- updating destination's name to it
    // would violate that index. Must resolve to the destination without attempting the update.
    const resolved = await upsertTopic(source.name, destination.slug)

    expect(resolved.id).toBe(destination.id)
  })

  it('rejects when the slug and name resolve to different topics', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser()
    const source = await upsertTopic(`Mismatch Source ${random}`, `mismatch-source-${random}`)
    const destination = await upsertTopic(`Mismatch Dest ${random}`, `mismatch-dest-${random}`)
    await mergeTopicForTest(source.id, destination.id, user!.id)
    const other = await upsertTopic(`Mismatch Other ${random}`, `mismatch-other-${random}`)

    // source.slug resolves (via the merge) to destination, but other.name resolves to a
    // wholly unrelated active topic -- an inconsistent input that must be rejected rather
    // than silently attaching the update to whichever side happens to win.
    await expect(upsertTopic(other.name, source.slug)).rejects.toMatchObject({ status: 409 })
  })

  it('retries cleanly when concurrent upserts race on the same topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const name = `Concurrent Topic ${random}`
    const slug = `concurrent-topic-${random}`

    const [topic1, topic2, topic3, topic4] = await Promise.all([
      upsertTopic(name, slug),
      upsertTopic(name, slug),
      upsertTopic(name, slug),
      upsertTopic(name, slug),
    ])
    expect(topic2.id).toBe(topic1.id)
    expect(topic3.id).toBe(topic1.id)
    expect(topic4.id).toBe(topic1.id)

    const fetched = await getTopicByAny(slug)
    expect(fetched).toBeDefined()
    expect(fetched!.id).toBe(topic1.id)
  })
})
