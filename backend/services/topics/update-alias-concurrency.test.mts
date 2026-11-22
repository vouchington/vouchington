import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  createTestUser,
  insertTestTopic,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { describe, expect, it } from 'vitest'
import { createTopicAliases, createUnlinkedTopicAlias, linkTopicAlias } from './aliases.mts'
import { getTopicByAny } from './get.mts'
import { updateTopic } from './update.mts'

describe('topic slug and alias concurrency', () => {
  it('commits an alias addition and a slug change on the same topic', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = randomUUID()
    const previousSlug = `original-${suffix}`
    const nextSlug = `next-${suffix}`
    const extraAlias = `retained-${suffix}`
    const topicId = await insertTestTopic({
      name: `Topic for coordinated alias additions ${suffix}`,
      slug: previousSlug,
      createdById: admin.id,
    })
    const topic = await getTopicByAny(topicId, { readOnly: false })
    if (!topic) throw new Error('Expected the fixture topic')

    await using adding = await beginTransaction()
    const options = { query: adding, skipSideEffects: true }
    await createTopicAliases(topicId, extraAlias, options)
    const holderProcessId = await getTestPostgresBackendProcessId(adding)
    let finished: Promise<void> | undefined

    const updated = await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        // Both the slug UPDATE and alias claim reference topics.
        queryMarker: 'topics',
        releaseHolder: () => (finished ??= adding.rollback()),
      },
      async waitForLock => {
        const pending = updateTopic(admin, topic, { slug: nextSlug }, { skipSideEffects: true })
        await waitForLock(pending)
        await createTopicAliases(topicId, nextSlug, options)
        await (finished ??= adding.commit())
        return pending
      },
    )

    expect(updated).toMatchObject({ id: topicId, slug: nextSlug })
    await expect(getTopicByAny(topicId, { readOnly: false })).resolves.toMatchObject({
      slug: nextSlug,
      aliases: expect.arrayContaining([previousSlug, nextSlug, extraAlias]),
    })
  })
  it.each(['create', 'link', 'create-old'] as const)(
    'commits a hostname and slug update while another transaction tries to %s an alias',
    async aliasAction => {
      const admin = await createTestUser({ administrator: true })
      const suffix = randomUUID().replaceAll('-', '')
      const previousSlug = `original-${suffix}`
      const nextSlug = `next${suffix}`
      const extraAlias = `retained-${suffix}`
      const topicId = await insertTestTopic({
        name: `Topic for concurrent ${aliasAction} ${suffix}`,
        slug: previousSlug,
        createdById: admin.id,
      })
      const topic = await getTopicByAny(topicId, { readOnly: false })
      if (!topic) throw new Error('Expected the fixture topic')
      const alias = await createUnlinkedTopicAlias(nextSlug)
      const hostnameId = await insertTestUrlHostname({ hostname: `alias-${suffix}.example.com` })

      await using updating = await beginTransaction()
      const options = { query: updating, skipSideEffects: true } as const
      await createTopicAliases(topicId, extraAlias, options)
      const holderProcessId = await getTestPostgresBackendProcessId(updating)
      let finished: Promise<void> | undefined
      await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'topics',
          releaseHolder: () => (finished ??= updating.rollback()),
        },
        async waitForLock => {
          const aliasOptions = { skipSideEffects: true }
          const pending =
            aliasAction === 'create'
              ? createTopicAliases(topicId, nextSlug, aliasOptions)
              : aliasAction === 'create-old'
                ? createTopicAliases(topicId, previousSlug, aliasOptions)
                : linkTopicAlias(topicId, alias.id, aliasOptions)
          await waitForLock(pending)
          await updateTopic(admin, topic, { slug: nextSlug, hostname: hostnameId }, options)
          await (finished ??= updating.commit())
          await pending
        },
      )

      await expect(getTopicByAny(topicId, { readOnly: false })).resolves.toMatchObject({
        slug: nextSlug,
        hostname_id: hostnameId,
        aliases: expect.arrayContaining([previousSlug, nextSlug, extraAlias]),
      })
    },
  )
})
