import { it, expect, describe } from 'vitest'
import { upsertEntityRelation } from '../upsert.mts'
import { entityRelationMetadatum } from '../metadata.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  softDeleteEntityRelationTest,
} from '@voucha/test-helpers'

describe('upsert.generated (basic)', () => {
  it('upsertEntityRelation returns empty array for empty objects', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'topic' && m.predicate === 'related',
    )!

    const result = await upsertEntityRelation(user!, metadata, topic, [])
    expect(result).toEqual([])
  })

  it('upsertEntityRelation creates relation between topic and topic', async () => {
    const user = await createTestUser({ administrator: true })
    const subjectTopic = await createTestTopic()
    const objectTopic = await createTestTopic()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'topic' && m.predicate === 'related',
    )!

    const relations = await upsertEntityRelation(user!, metadata, subjectTopic, [objectTopic])

    expect(relations.length).toBe(1)
    expect(relations[0].subject_id).toBe(subjectTopic.id)
    expect(relations[0].object_id).toBe(objectTopic.id)
    expect(relations[0].created_by_id).toBe(user!.id)
    expect(relations[0].created_at).toBeInstanceOf(Date)
    expect(relations[0].deleted_at).toBeNull()

    // Verify in database
    const rows = (await getEntityRelation(
      'relation__topic__related__topic',
      subjectTopic.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rows.length).toBe(1)
    expect(rows[0].deleted_at).toBeNull()
  })

  it('upsertEntityRelation creates relation between post and topic', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
    )!

    const relations = await upsertEntityRelation(user!, metadata, post, [topic])

    expect(relations.length).toBe(1)
    expect(relations[0].subject_id).toBe(post.id)
    expect(relations[0].object_id).toBe(topic.id)
    expect(relations[0].created_by_id).toBe(user!.id)

    // Verify in database
    const rows = await getEntityRelation('relation__post__category__topic', post.id, topic.id)
    expect(rows.length).toBe(1)
  })

  it('upsertEntityRelation creates relation between topic and post', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const post = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'post' && m.predicate === 'related',
    )!

    const relations = await upsertEntityRelation(user!, metadata, topic, [post])

    expect(relations.length).toBe(1)
    expect(relations[0].subject_id).toBe(topic.id)
    expect(relations[0].object_id).toBe(post.id)
    expect(relations[0].created_by_id).toBe(user!.id)

    // Verify in database
    const rows = await getEntityRelation('relation__topic__related__post', topic.id, post.id)
    expect(rows.length).toBe(1)
  })

  it('upsertEntityRelation creates relation between two posts', async () => {
    const user = await createTestUser({ administrator: true })
    const subjectPost = await createTestPost()
    const objectPost = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
    )!

    const relations = await upsertEntityRelation(user!, metadata, subjectPost, [objectPost])

    expect(relations.length).toBe(1)
    expect(relations[0].subject_id).toBe(subjectPost.id)
    expect(relations[0].object_id).toBe(objectPost.id)

    // Verify in database
    const rows = await getEntityRelation(
      'relation__post__related__post',
      subjectPost.id,
      objectPost.id,
    )
    expect(rows.length).toBe(1)
  })

  it('upsertEntityRelation creates multiple relations', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const post1 = await createTestPost()
    const post2 = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'post' && m.predicate === 'related',
    )!

    const relations = await upsertEntityRelation(user!, metadata, topic, [post1, post2])

    expect(relations.length).toBe(2)
    expect(
      relations.map(r => r.object_id).toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ).toEqual([post1.id, post2.id].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })

  it('upsertEntityRelation undeletes on conflict', async () => {
    const user = await createTestUser({ administrator: true })
    const topic1 = await createTestTopic()
    const topic2 = await createTestTopic()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'topic' && m.predicate === 'related',
    )!

    // Create relation
    const relations1 = await upsertEntityRelation(user!, metadata, topic1, [topic2])
    expect(relations1.length).toBe(1)

    // Delete the relation
    await softDeleteEntityRelationTest(
      'relation__topic__related__topic',
      topic1.id,
      topic2.id,
      user!.id,
    )

    // Verify it's deleted
    const deletedRows = (await getEntityRelation(
      'relation__topic__related__topic',
      topic1.id,
      topic2.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(deletedRows[0].deleted_at).not.toBeNull()

    // Upsert again - should undelete
    const relations2 = await upsertEntityRelation(user!, metadata, topic1, [topic2])
    expect(relations2.length).toBe(1)
    expect(relations2[0].deleted_at).toBeNull()
    expect(relations2[0].deleted_by_id).toBeNull()

    // Verify in database
    const rows = (await getEntityRelation(
      'relation__topic__related__topic',
      topic1.id,
      topic2.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rows[0].deleted_at).toBeNull()
  })
})
