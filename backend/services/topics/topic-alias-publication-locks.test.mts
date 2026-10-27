import * as postPublication from '@services/post-publication'
import { beginTransaction, createTestTopic } from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import { claimTopicAlias } from './claim-topic-alias.mts'
import { unlinkTopicAlias } from './delete-topic-aliases.mts'
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
  const lockAliases = postPublication.lockTopicAliasPublicationScopes
  const aliasesLocked = Promise.withResolvers<void>()
  const aliasSpy = vi
    .spyOn(postPublication, 'lockTopicAliasPublicationScopes')
    .mockImplementation(async (query, topicAliasIds) => {
      await lockAliases(query, topicAliasIds)
      aliasesLocked.resolve()
    })

  const mutation = mutate()
  try {
    await aliasesLocked.promise
    await expect(contendForPublicationLock()).rejects.toMatchObject({ code: '55P03' })
  } finally {
    releaseRow.resolve()
    aliasSpy.mockRestore()
  }
  await holder
  await expect(mutation).resolves.toBeDefined()

  async function contendForPublicationLock(): Promise<void> {
    await using query = await beginTransaction()
    await query(`/* topic alias publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
    await lockAliases(query, [aliasId])
    await query.commit()
  }
}
