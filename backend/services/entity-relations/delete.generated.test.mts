import { it, expect, describe } from 'vitest'
import { softDeleteEntityRelation, softDeleteEntityRelationsForSubjects } from './delete.mts'
import { upsertEntityRelation } from './upsert.mts'
import { upsertEntityRelationsForSubjects } from './upsert-for-subjects.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  insertEntityRelation,
} from '@voucha/test-helpers'

describe('delete.generated', () => {
  it('softDeleteEntityRelation soft-deletes a relation', async () => {
    const user = await createTestUser({ administrator: true })
    const subject = await createTestTopic()
    const objectTopic = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    await upsertEntityRelation(user!, metadata, subject, [objectTopic])

    const rowsBefore = (await getEntityRelation(
      'relation__topic__related__topic',
      subject.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null; deleted_by_id: string | null }>
    expect(rowsBefore[0].deleted_at).toBeNull()

    await softDeleteEntityRelation(user!, metadata, subject, [objectTopic])

    const rowsAfter = (await getEntityRelation(
      'relation__topic__related__topic',
      subject.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null; deleted_by_id: string | null }>
    expect(rowsAfter[0].deleted_at).not.toBeNull()
    expect(rowsAfter[0].deleted_by_id).toBe(user!.id)
  })

  it('softDeleteEntityRelation is a no-op for empty objects array', async () => {
    const user = await createTestUser({ administrator: true })
    const subject = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    // Should not throw
    await expect(softDeleteEntityRelation(user!, metadata, subject, [])).resolves.toBeUndefined()
  })

  it('softDeleteEntityRelation soft-deletes multiple objects for one subject', async () => {
    const user = await createTestUser({ administrator: true })
    const subject = await createTestTopic()
    const object1 = await createTestTopic()
    const object2 = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    await upsertEntityRelation(user!, metadata, subject, [object1, object2])
    await softDeleteEntityRelation(user!, metadata, subject, [object1, object2])

    for (const obj of [object1, object2]) {
      const rows = (await getEntityRelation(
        'relation__topic__related__topic',
        subject.id,
        obj.id,
      )) as Array<{ deleted_at: Date | null }>
      expect(rows[0].deleted_at).not.toBeNull()
    }
  })

  it('softDeleteEntityRelationsForSubjects soft-deletes relations for multiple subjects', async () => {
    const user = await createTestUser({ administrator: true })
    const subject1 = await createTestTopic()
    const subject2 = await createTestTopic()
    const objectTopic = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    await upsertEntityRelationsForSubjects(user!, metadata, [subject1, subject2], objectTopic)

    const rowsBefore = (await getEntityRelation(
      'relation__topic__related__topic',
      subject1.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rowsBefore[0].deleted_at).toBeNull()

    await softDeleteEntityRelationsForSubjects(user!, metadata, [subject1, subject2], objectTopic)

    for (const subjectId of [subject1.id, subject2.id]) {
      const rows = (await getEntityRelation(
        'relation__topic__related__topic',
        subjectId,
        objectTopic.id,
      )) as Array<{ deleted_at: Date | null; deleted_by_id: string | null }>
      expect(rows[0].deleted_at).not.toBeNull()
      expect(rows[0].deleted_by_id).toBe(user!.id)
    }
  })

  it('softDeleteEntityRelationsForSubjects is a no-op for empty subjects array', async () => {
    const user = await createTestUser({ administrator: true })
    const objectTopic = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    await expect(
      softDeleteEntityRelationsForSubjects(user!, metadata, [], objectTopic),
    ).resolves.toBeUndefined()
  })

  it('softDeleteEntityRelationsForSubjects only deletes targeted subject-object pair', async () => {
    const user = await createTestUser({ administrator: true })
    const subject1 = await createTestTopic()
    const subject2 = await createTestTopic()
    const objectTopic = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })

    await upsertEntityRelationsForSubjects(user!, metadata, [subject1, subject2], objectTopic)

    // Only delete subject1's relation
    await softDeleteEntityRelationsForSubjects(user!, metadata, [subject1], objectTopic)

    const rows1 = (await getEntityRelation(
      'relation__topic__related__topic',
      subject1.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rows1[0].deleted_at).not.toBeNull()

    // subject2's relation should remain active
    const rows2 = (await getEntityRelation(
      'relation__topic__related__topic',
      subject2.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rows2[0].deleted_at).toBeNull()
  })

  it('softDeleteEntityRelation soft-deletes a post-topic relation', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })

    await upsertEntityRelation(user!, metadata, post, [topic])
    await softDeleteEntityRelation(user!, metadata, post, [topic])

    const rows = (await getEntityRelation(
      'relation__post__category__topic',
      post.id,
      topic.id,
    )) as Array<{
      deleted_at: Date | null
    }>
    expect(rows[0].deleted_at).not.toBeNull()
  })

  it('softDeleteEntityRelation soft-deletes a topic publisher_type relation', async () => {
    const user = await createTestUser({ administrator: true })
    const subject = await createTestTopic({ topic_type: 'rss_feed' })
    const objectTopic = await createTestTopic()

    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })

    await insertEntityRelation('relation__topic__publisher_type__topic', subject.id, objectTopic.id)
    await softDeleteEntityRelation(user!, metadata, subject, [objectTopic])

    const rows = (await getEntityRelation(
      'relation__topic__publisher_type__topic',
      subject.id,
      objectTopic.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(rows[0].deleted_at).not.toBeNull()
  })
})
