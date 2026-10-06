import { beginTransaction, createTestTopic, createTestUser } from '@voucha/test-helpers'
import * as postPublication from '@services/post-publication'
import { describe, expect, it, vi } from 'vitest'
import { createUnlinkedTopicAlias, linkTopicAlias } from './aliases.mts'

describe('linkTopicAlias publication locking', () => {
  it('takes the alias publication scope before waiting on the topic row', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user, name: `Alias lock ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`alias-lock-${crypto.randomUUID()}`)
    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    async function holdTopicRow(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* linkTopicAlias publication lock test */
        SELECT 1 FROM topics WHERE id = $1::uuid FOR UPDATE`,
        [topic.id],
      )
      rowLocked.resolve()
      await releaseRow.promise
      await query.commit()
    }
    const holder = holdTopicRow()
    await rowLocked.promise
    const lockAliases = postPublication.lockTopicAliasPublicationScopes
    const aliasesLocked = Promise.withResolvers<void>()
    const aliasSpy = vi
      .spyOn(postPublication, 'lockTopicAliasPublicationScopes')
      .mockImplementation(async (query, topicAliasIds) => {
        await lockAliases(query, topicAliasIds)
        aliasesLocked.resolve()
      })

    const linking = linkTopicAlias(topic.id, alias.id)
    try {
      await aliasesLocked.promise
      await expect(contendForAliasPublicationLock()).rejects.toMatchObject({ code: '55P03' })
    } finally {
      releaseRow.resolve()
      aliasSpy.mockRestore()
    }
    await holder
    await expect(linking).resolves.toMatchObject({ id: alias.id, topic_id: topic.id })

    async function contendForAliasPublicationLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(`/* linkTopicAlias publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
      await lockAliases(query, [alias.id])
      await query.commit()
    }
  })
})
