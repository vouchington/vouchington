import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getTestPostgresBackendProcessId,
  softDeleteTopic,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { lockTopicHostnameMutations } from '@services/urls-hostnames/ownership-lock'
import { createTopicAliases, linkTopicAlias } from './aliases.mts'
import { createTopic } from './create.mts'
import { getTopicByAny } from './get.mts'
import { updateTopic } from './update.mts'
import { getTopicAliasRecordByValue } from './get-topic-aliases.mts'

describe('hostname mutations with topic aliases', () => {
  it('takes the alias scope before a hostname-and-slug update locks the topic row', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin })
    const [alias] = await createTopicAliases(topic.id, [topic.slug], { skipSideEffects: true })
    expect(alias).toBeDefined()
    await using holder = await beginTransaction()
    await lockTopicAliasPublicationScopes(holder, [alias!.id])
    const pid = await getTestPostgresBackendProcessId(holder)
    const nextSlug = `updated-${crypto.randomUUID()}`
    const current = (await getTopicByAny(topic.id))!
    const updating = await withTestOwnedPostgresWait(
      {
        holderProcessId: pid,
        pool: 'write',
        lock: { kind: 'advisory', key: `topic_alias:${alias!.id.toLowerCase()}` },
        queryMarker: 'lockTopicAliasPublicationCaptures',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const update = updateTopic(admin, current, {
          slug: nextSlug,
          hostname: `updated-${crypto.randomUUID()}.example.com`,
        })
        await waitForLock(update)
        // This owning boundary needs the topic row while the update waits on our alias scope.
        await createTopicAliases(topic.id, [topic.slug], { query: holder, skipSideEffects: true })
        await holder.commit()
        return update.then(
          value => ({ value }),
          (err: unknown) => ({ err }),
        )
      },
    )
    expect(updating).toMatchObject({ value: { id: topic.id, slug: nextSlug } })
  })

  it('locks a source-alias owner that becomes deleted after discovery before reviving it', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin })
    const [alias] = await createTopicAliases(topic.id, [topic.slug], { skipSideEffects: true })
    expect(alias).toBeDefined()
    await using holder = await beginTransaction()
    await lockTopicHostnameMutations(holder, [topic.id])
    const pid = await getTestPostgresBackendProcessId(holder)
    const name = `Revived after discovery ${crypto.randomUUID()}`
    const creating = await withTestOwnedPostgresWait(
      {
        holderProcessId: pid,
        pool: 'write',
        lock: { kind: 'advisory', key: `topic-hostname:${topic.id.toLowerCase()}` },
        queryMarker: 'lockTopicHostnameMutations',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const create = createTopic(admin, WEB_PROVENANCE, {
          name,
          slug: topic.slug,
          source_topic_alias_id: alias!.id,
          hostname: `revived-${crypto.randomUUID()}.example.com`,
        })
        await waitForLock(create)
        await softDeleteTopic(topic.id, admin.id)
        await holder.commit()
        return create.then(
          value => ({ value }),
          (err: unknown) => ({ err }),
        )
      },
    )
    expect(creating).toMatchObject({
      value: { id: topic.id, name },
    })
  })

  it('does not revive an unlocked owner after the source alias is retargeted', async () => {
    const admin = await createTestUser({ administrator: true })
    const first = await createTestTopic({ user: admin })
    const second = await createTestTopic({ user: admin })
    const [alias] = await createTopicAliases(first.id, [first.slug], { skipSideEffects: true })
    await using holder = await beginTransaction()
    await lockTopicHostnameMutations(holder, [first.id])
    const pid = await getTestPostgresBackendProcessId(holder)
    const creating = await withTestOwnedPostgresWait(
      {
        holderProcessId: pid,
        pool: 'write',
        lock: { kind: 'advisory', key: `topic-hostname:${first.id.toLowerCase()}` },
        queryMarker: 'lockTopicHostnameMutations',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const create = createTopic(admin, WEB_PROVENANCE, {
          name: `Retargeted revival ${crypto.randomUUID()}`,
          slug: first.slug,
          source_topic_alias_id: alias!.id,
          hostname: `retargeted-${crypto.randomUUID()}.example.com`,
        })
        await waitForLock(create)
        await updateTopic(
          admin,
          (await getTopicByAny(first.id))!,
          { slug: `moved-${crypto.randomUUID()}` },
          { skipSideEffects: true },
        )
        await softDeleteTopic(first.id, admin.id)
        await linkTopicAlias(second.id, alias!.id, { skipSideEffects: true })
        await updateTopic(
          admin,
          (await getTopicByAny(second.id))!,
          { slug: first.slug },
          { skipSideEffects: true },
        )
        await softDeleteTopic(second.id, admin.id)
        await holder.commit()
        return create.then(
          () => null,
          (err: unknown) => err,
        )
      },
    )
    expect(creating).toMatchObject({ code: '23505' })
    expect(await getTopicByAny(first.id)).toBeNull()
    expect(await getTopicByAny(second.id)).toBeNull()
    expect(await getTopicAliasRecordByValue(second.id, first.slug)).toMatchObject({
      id: alias!.id,
    })
  })
})
