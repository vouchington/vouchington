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
import { relationLimitsConfig } from './relation-limits.mts'
import { upsertEntityRelation } from './upsert.mts'
import { writeEntityRelations } from './write-relations.mts'
import { softDeleteEntityRelation } from './delete.mts'

const table = 'relation__post__related__url'
const relation = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  predicate: 'related',
  objectType: 'url',
})

describe('post related URL capacity', () => {
  it('preserves existing relations over a lowered limit, permits retries, and refuses new batches', async () => {
    await relationLimitsConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(relationLimitsConfig, {
      post_related_url: 2,
    })
    onTestFinished(restore)
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const [first, second, third] = await Promise.all(
      Array.from({ length: 3 }, () => createTestUrlWithHostname()),
    )
    await upsertEntityRelation(user, relation, post, [{ id: first }, { id: second }])
    restore()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    await expect(upsertEntityRelation(user, relation, post, [{ id: first }])).resolves.toHaveLength(
      1,
    )
    await expect(
      upsertEntityRelation(user, relation, post, [{ id: first }, { id: third }]),
    ).rejects.toMatchObject({ status: 409, code: 'RELATION_LIMIT_REACHED' })
    expect(await getEntityRelation(table, post.id, first)).toHaveLength(1)
    expect(await getEntityRelation(table, post.id, second)).toHaveLength(1)
    expect(await getEntityRelation(table, post.id, third)).toHaveLength(0)
  })

  it('refuses resurrection at capacity', async () => {
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
    await upsertEntityRelation(user, relation, post, [{ id: first }])
    await softDeleteEntityRelation(user, relation, post, [{ id: first }])
    await upsertEntityRelation(user, relation, post, [{ id: second }])
    await expect(upsertEntityRelation(user, relation, post, [{ id: first }])).rejects.toMatchObject(
      { status: 409, code: 'RELATION_LIMIT_REACHED' },
    )
    expect(await getEntityRelation(table, post.id, second)).toHaveLength(1)
  })

  it('sees prior inserts in the same borrowed transaction', async () => {
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
    await upsertEntityRelation(user, relation, post, [{ id: first }], { query })
    await expect(
      upsertEntityRelation(user, relation, post, [{ id: second }], { query }),
    ).rejects.toMatchObject({ status: 409, code: 'RELATION_LIMIT_REACHED' })
  })

  it('serializes competing upsert and write paths at the last slot', async () => {
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
    const results = await Promise.allSettled([
      upsertEntityRelation(user, relation, post, [{ id: first }]),
      writeEntityRelations(relation, user, [{ subject: post, object: { id: second } }]),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toMatchObject({ reason: { status: 409, code: 'RELATION_LIMIT_REACHED' } })
    const rows = await Promise.all([
      getEntityRelation(table, post.id, first),
      getEntityRelation(table, post.id, second),
    ])
    expect(rows.flat()).toHaveLength(1)
  })
})
