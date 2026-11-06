import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestUrlWithHostname,
  createTestUser,
  getEntityRelation,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { TransactionQuery } from '@data-stores/psql/types'
import '@voucha/test-helpers/entity-url-guard-registrations'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { lockPostPublicationPostScopes } from '@services/post-publication'
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

describe('post related URL capacity under the publication lock', () => {
  it('rechecks after preflight when another transaction fills the last slot, even without publication capture', async () => {
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
    const reachedLock = Promise.withResolvers<void>()
    const proceed = Promise.withResolvers<void>()
    await using holder = await beginTransaction()
    await using contender = await beginTransaction()
    const intercepted = new Proxy(contender, {
      apply(target, thisArgument, argumentsList: Parameters<TransactionQuery>) {
        const [input] = argumentsList
        const statement = typeof input === 'string' ? input : input.text
        if (!statement.includes('lockPostPublicationCaptures'))
          return Reflect.apply(target, thisArgument, argumentsList)
        reachedLock.resolve()
        return proceed.promise.then(() => Reflect.apply(target, thisArgument, argumentsList))
      },
    })
    const attempt = writeEntityRelations(
      relation,
      user,
      [{ subject: post, object: { id: second } }],
      {
        query: intercepted,
        capturePublication: false,
      },
    ).then(
      () => null,
      (err: unknown) => err,
    )
    try {
      await Promise.race([
        reachedLock.promise,
        attempt.then(error => {
          throw new Error('Write completed before reaching the post lock', { cause: error })
        }),
      ])
      await lockPostPublicationPostScopes(holder, [post.id])
      await assertPostRelatedUrlsAllowed(user, relation, post, [{ id: first }], { query: holder })
      await insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction(holder, user, post.id, [
        first,
      ])
      await holder.commit()
    } finally {
      proceed.resolve()
    }
    expect(await attempt).toMatchObject({ status: 409, code: 'RELATION_LIMIT_REACHED' })
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
    await lockPostPublicationPostScopes(query, [post.id])
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
