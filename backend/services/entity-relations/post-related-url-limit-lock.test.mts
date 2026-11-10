import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestUrlWithHostname,
  createTestUser,
  getEntityRelation,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import '@voucha/test-helpers/entity-url-guard-registrations'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { assertPostRelatedUrlsAllowed } from './assert-post-related-urls-allowed.mts'
import { relationLimitsConfig } from './relation-limits.mts'
import {
  insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction,
  writeEntityRelations,
} from './write-relations.mts'

const table = 'relation__post__related__url'
const relation = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  predicate: 'related',
  objectType: 'url',
})

describe('post related URL capacity', () => {
  it('rejects a second related URL after a committed fill, even without publication capture', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const [first, second] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await using holder = await beginTransaction()
    await assertPostRelatedUrlsAllowed(user, relation, post, [{ id: first }], { query: holder })
    await insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction(holder, user, post.id, [
      first,
    ])
    await holder.commit()
    await expect(
      writeEntityRelations(relation, user, [{ subject: post, object: { id: second } }], {
        capturePublication: false,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'RELATION_LIMIT_REACHED' })
    expect(await getEntityRelation(table, post.id, first)).toHaveLength(1)
    expect(await getEntityRelation(table, post.id, second)).toHaveLength(0)
  })

  it('prevalidates capacity under the caller lock while allowing an existing URL', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const [first, second] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await using query = await beginTransaction()
    await assertPostRelatedUrlsAllowed(user, relation, post, [{ id: first }], { query })
    await insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction(query, user, post.id, [
      first,
    ])
    await assertPostRelatedUrlsAllowed(user, relation, post, [{ id: first }], { query })
    await expect(
      insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction(query, user, post.id, [first]),
    ).resolves.toHaveLength(1)
    await expect(
      assertPostRelatedUrlsAllowed(user, relation, post, [{ id: second }], { query }),
    ).rejects.toMatchObject({ status: 409, code: 'RELATION_LIMIT_REACHED' })
    await query.commit()
    expect(await getEntityRelation(table, post.id, first)).toHaveLength(1)
    expect(await getEntityRelation(table, post.id, second)).toHaveLength(0)
  })
})
