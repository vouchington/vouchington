import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, getEntityRelation } from '@voucha/test-helpers'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { commitRelationWriteDuringCompetingMutationForTest } from '@voucha/test-helpers/relation-write-interleaving'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { upsertEntityRelation } from './upsert.mts'
import { softDeleteEntityRelation, softDeleteEntityRelationsForSubjects } from './delete.mts'

describe('bidirectional relation written-row scope', () => {
  it('writes and deletes a symmetric topic pair', async () => {
    const creator = await createTestUser()
    const first = await createTestTopic({ user: creator })
    const second = await createTestTopic({ user: creator })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      predicate: 'related',
      objectType: 'topic',
    })
    {
      const created = await upsertEntityRelation(creator, relation, first, [second], {
        vote: false,
      })
      expect(created).toHaveLength(1)
      expect(await getEntityRelation(relation.table_name, second.id, first.id)).toHaveLength(1)
      await softDeleteEntityRelation(creator, relation, first, [second])
      expect(await getEntityRelation(relation.table_name, first.id, second.id)).toEqual([
        expect.objectContaining({
          subject_id: first.id,
          object_id: second.id,
          deleted_at: expect.any(Date),
        }),
      ])
      expect(await getEntityRelation(relation.table_name, second.id, first.id)).toEqual([
        expect.objectContaining({
          subject_id: second.id,
          object_id: first.id,
          deleted_at: expect.any(Date),
        }),
      ])
      await upsertEntityRelation(creator, relation, first, [second], { vote: false })
      expect(await getEntityRelation(relation.table_name, first.id, second.id)).toEqual([
        expect.objectContaining({ subject_id: first.id, object_id: second.id, deleted_at: null }),
      ])
      expect(await getEntityRelation(relation.table_name, second.id, first.id)).toEqual([
        expect.objectContaining({ subject_id: second.id, object_id: first.id, deleted_at: null }),
      ])
      await softDeleteEntityRelationsForSubjects(creator, relation, [first], second)
      expect(await getEntityRelation(relation.table_name, first.id, second.id)).toEqual([
        expect.objectContaining({
          subject_id: first.id,
          object_id: second.id,
          deleted_at: expect.any(Date),
        }),
      ])
      expect(await getEntityRelation(relation.table_name, second.id, first.id)).toEqual([
        expect.objectContaining({
          subject_id: second.id,
          object_id: first.id,
          deleted_at: expect.any(Date),
        }),
      ])
    }
  })

  it('deletes both directions after the opposite direction is upserted', async () => {
    const creator = await createTestUser()
    const first = await createTestTopic({ user: creator })
    const second = await createTestTopic({ user: creator })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      predicate: 'related',
      objectType: 'topic',
    })
    const [created] = await upsertEntityRelation(creator, relation, first, [second], {
      vote: false,
    })
    expect(created).toMatchObject({ subject_id: first.id, object_id: second.id })

    await commitRelationWriteDuringCompetingMutationForTest(
      query => upsertEntityRelation(creator, relation, first, [second], { query, vote: false }),
      '/* softDeleteBidirectionalRelationRows */',
      () => softDeleteEntityRelationsForSubjects(creator, relation, [second], first),
    )

    await expect(getEntityRelation(relation.table_name, first.id, second.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: expect.any(Date), deleted_by_id: creator.id }),
    ])
    await expect(getEntityRelation(relation.table_name, second.id, first.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: expect.any(Date), deleted_by_id: creator.id }),
    ])
  })

  it('deletes both directions when an upsert commits after the first delete finds no row', async () => {
    const creator = await createTestUser()
    const first = await createTestTopic({ user: creator })
    const second = await createTestTopic({ user: creator })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      predicate: 'related',
      objectType: 'topic',
    })
    const [lowerId, higherId] = [first.id, second.id].toSorted()
    const restore = afterPostgresTransactionQueryForTest(
      '/* softDeleteBidirectionalRelationRows */',
      values => values[1] === lowerId && values[2] === higherId,
      async () => {
        await expect(
          upsertEntityRelation(creator, relation, first, [second], { vote: false }),
        ).resolves.toHaveLength(1)
      },
    )
    try {
      await softDeleteEntityRelation(creator, relation, second, [first])
    } finally {
      restore()
    }

    await expect(getEntityRelation(relation.table_name, first.id, second.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: expect.any(Date), deleted_by_id: creator.id }),
    ])
    await expect(getEntityRelation(relation.table_name, second.id, first.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: expect.any(Date), deleted_by_id: creator.id }),
    ])
  })

  it('reactivates both directions after the opposite direction is deleted', async () => {
    const creator = await createTestUser()
    const first = await createTestTopic({ user: creator })
    const second = await createTestTopic({ user: creator })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      predicate: 'related',
      objectType: 'topic',
    })
    const [created] = await upsertEntityRelation(creator, relation, first, [second], {
      vote: false,
    })
    expect(created).toMatchObject({ subject_id: first.id, object_id: second.id })

    const reactivated = await commitRelationWriteDuringCompetingMutationForTest(
      query => softDeleteEntityRelation(creator, relation, first, [second], { query }),
      '/* buildBidirectionalInsertQuery */',
      () => upsertEntityRelation(creator, relation, second, [first], { vote: false }),
    )

    expect(reactivated).toEqual([
      expect.objectContaining({ subject_id: second.id, object_id: first.id, deleted_at: null }),
    ])
    await expect(getEntityRelation(relation.table_name, first.id, second.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: null, deleted_by_id: null }),
    ])
    await expect(getEntityRelation(relation.table_name, second.id, first.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: null, deleted_by_id: null }),
    ])
  })
})
