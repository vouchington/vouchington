import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, getEntityRelation } from '@voucha/test-helpers'
import { withHeldRelationReadContextForTest } from '@voucha/test-helpers/relation-read-context'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { upsertEntityRelation } from './upsert.mts'
import { softDeleteEntityRelation, softDeleteEntityRelationsForSubjects } from './delete.mts'

describe('bidirectional relation written-row scope', () => {
  it('writes and deletes a symmetric topic pair while topic attachment context is held', async () => {
    const creator = await createTestUser()
    const first = await createTestTopic({ user: creator })
    const second = await createTestTopic({ user: creator })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      predicate: 'related',
      objectType: 'topic',
    })
    await withHeldRelationReadContextForTest({ topicIds: [first.id, second.id] }, async () => {
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
    })
  })
})
