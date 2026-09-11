import { describe, expect, it } from 'vitest'
import { createTestUser, getEntityRelation, softDeleteUser } from '@voucha/test-helpers'
import { getUserTagTopics } from '../topics/user-tag-topics.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { upsertEntityRelationsForSubjects } from './upsert-for-subjects.mts'

describe('user-subject entity-relation active-user fence', () => {
  it('rejects a bulk write when any user subject has been deleted', async () => {
    const creator = await createTestUser()
    const activeSubject = await createTestUser()
    const deletedSubject = await createTestUser()
    const [tag] = await getUserTagTopics()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'category',
      objectType: 'topic',
    })
    await softDeleteUser(deletedSubject.id)

    await expect(
      upsertEntityRelationsForSubjects(creator, relation, [activeSubject, deletedSubject], tag!, {
        vote: false,
      }),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      getEntityRelation(relation.table_name, activeSubject.id, tag!.id),
    ).resolves.toEqual([])
  })
})
