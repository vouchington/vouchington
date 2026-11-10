import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getTestPostgresBackendProcessId,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { createTopicAliases } from './aliases.mts'
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
})
