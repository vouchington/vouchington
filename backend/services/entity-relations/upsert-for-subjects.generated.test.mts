import { it, expect, describe } from 'vitest'
import { upsertEntityRelationsForSubjects } from './upsert-for-subjects.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import {
  createRandomString,
  createTestUserDirect,
  getEntityRelation,
  insertTestPost,
  insertTestTopic,
  softDeleteEntityRelationTest,
} from '@voucha/test-helpers'

describe('upsert-for-subjects.generated', () => {
  async function createTopic(createdById: string) {
    const random = createRandomString(10)
    const id = await insertTestTopic({
      name: `Relation Topic ${random}`,
      slug: `relation-topic-${random}`,
      createdById,
    })
    return { id }
  }

  async function createPost(createdById: string) {
    const random = createRandomString(10)
    const id = await insertTestPost({
      title: `Relation Post ${random}`,
      slug: `relation-post-${random}`,
      createdById,
      markdown: `Relation post ${random}`,
    })
    return { id }
  }

  it('upsertEntityRelationsForSubjects returns empty array for empty subjects', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const topic = await createTopic(user!.id)
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    const result = await upsertEntityRelationsForSubjects(user!, metadata, [], topic)
    expect(result).toEqual([])
  })

  it('upsertEntityRelationsForSubjects creates relations for multiple subjects', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const subject1 = await createTopic(user!.id)
    const subject2 = await createTopic(user!.id)
    const objectTopic = await createTopic(user!.id)

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    const relations = await upsertEntityRelationsForSubjects(
      user!,
      metadata,
      [subject1, subject2],
      objectTopic,
    )

    expect(relations.length).toBe(2)
    expect(relations.map(r => r.subject_id).toSorted()).toEqual(
      [subject1.id, subject2.id].toSorted(),
    )
    expect(relations.every(r => r.object_id === objectTopic.id)).toBe(true)
    expect(relations.every(r => r.created_by_id === user!.id)).toBe(true)
    expect(relations.every(r => r.deleted_at === null)).toBe(true)

    // Verify in database
    for (const subjectId of [subject1.id, subject2.id]) {
      const rows = await getEntityRelation(
        'relation__topic__related__topic',
        subjectId,
        objectTopic.id,
      )
      expect(rows.length).toBe(1)
    }
  })

  it('upsertEntityRelationsForSubjects creates a single subject-object relation', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const subject = await createPost(user!.id)
    const objectTopic = await createTopic(user!.id)

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })

    const relations = await upsertEntityRelationsForSubjects(
      user!,
      metadata,
      [subject],
      objectTopic,
    )

    expect(relations.length).toBe(1)
    expect(relations[0].subject_id).toBe(subject.id)
    expect(relations[0].object_id).toBe(objectTopic.id)
    expect(relations[0].created_by_id).toBe(user!.id)

    const rows = await getEntityRelation(
      'relation__post__category__topic',
      subject.id,
      objectTopic.id,
    )
    expect(rows.length).toBe(1)
  })

  it('upsertEntityRelationsForSubjects undeletes on conflict', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const subject = await createTopic(user!.id)
    const objectTopic = await createTopic(user!.id)

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    // Create relation
    await upsertEntityRelationsForSubjects(user!, metadata, [subject], objectTopic)

    // Soft-delete it
    await softDeleteEntityRelationTest(
      'relation__topic__related__topic',
      subject.id,
      objectTopic.id,
      user!.id,
    )

    // Verify it's deleted
    const deletedRows = (await getEntityRelation(
      'relation__topic__related__topic',
      subject.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(deletedRows[0].deleted_at).not.toBeNull()

    // Upsert again — should undelete
    const relations = await upsertEntityRelationsForSubjects(
      user!,
      metadata,
      [subject],
      objectTopic,
    )
    expect(relations.length).toBe(1)
    expect(relations[0].deleted_at).toBeNull()

    const rows = (await getEntityRelation(
      'relation__topic__related__topic',
      subject.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rows[0].deleted_at).toBeNull()
  })
})
