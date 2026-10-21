import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getTestPostgresBackendProcessId,
  softDeleteTopic,
  waitForTestPostgresLockWaiter,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { lockTopicHostnameMutations } from '@services/urls-hostnames/ownership-lock'
import { createTopicAliases } from './aliases.mts'
import { createTopic } from './create.mts'
import { getTopicByAny } from './get.mts'
import { updateTopic } from './update.mts'

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
    const updating = updateTopic(admin, (await getTopicByAny(topic.id))!, {
      slug: nextSlug,
      hostname: `updated-${crypto.randomUUID()}.example.com`,
    }).then(
      value => ({ value }),
      (err: unknown) => ({ err }),
    )
    try {
      await waitForTestPostgresLockWaiter(pid, 'lockTopicAliasPublicationCaptures')
      // This owning boundary needs the topic row while the update waits on our alias scope.
      await createTopicAliases(topic.id, [topic.slug], { query: holder, skipSideEffects: true })
    } finally {
      await holder.commit()
    }
    expect(await updating).toMatchObject({ value: { id: topic.id, slug: nextSlug } })
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
    const creating = createTopic(admin, WEB_PROVENANCE, {
      name,
      slug: topic.slug,
      source_topic_alias_id: alias!.id,
      hostname: `revived-${crypto.randomUUID()}.example.com`,
    }).then(
      value => ({ value }),
      (err: unknown) => ({ err }),
    )
    try {
      await waitForTestPostgresLockWaiter(pid, 'lockTopicHostnameMutations')
      await softDeleteTopic(topic.id, admin.id)
    } finally {
      await holder.commit()
    }
    expect(await creating).toMatchObject({
      value: { id: topic.id, name },
    })
  })
})
