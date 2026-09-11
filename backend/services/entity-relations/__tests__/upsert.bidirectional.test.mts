import { it, expect, describe } from 'vitest'
import { upsertEntityRelation } from '../upsert.mts'
import { softDeleteEntityRelation } from '../delete.mts'
import { entityRelationMetadatum } from '../metadata.mts'
import { stubUrlGuardsForSuite } from '../test-support.mts'
import {
  createTestPost,
  createTestUser,
  getEntityRelation,
  insertTestUrlDirect,
} from '@voucha/test-helpers'

describe('upsert.bidirectional', () => {
  stubUrlGuardsForSuite()

  it('upsertEntityRelation creates reverse relation for bidirectional predicates', async () => {
    const user = await createTestUser({ administrator: true })
    const postA = await createTestPost()
    const postB = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
    )!
    expect(metadata.bidirectional).toBe(true)

    // Create A -> B
    await upsertEntityRelation(user!, metadata, postA, [postB])

    // Verify A -> B exists
    const forwardRows = await getEntityRelation('relation__post__related__post', postA.id, postB.id)
    expect(forwardRows.length).toBe(1)
    expect((forwardRows[0] as { deleted_at: Date | null }).deleted_at).toBeNull()

    // Verify B -> A also exists (bidirectional)
    const reverseRows = await getEntityRelation('relation__post__related__post', postB.id, postA.id)
    expect(reverseRows.length).toBe(1)
    expect((reverseRows[0] as { deleted_at: Date | null }).deleted_at).toBeNull()
  })

  it('softDeleteEntityRelation removes reverse relation for bidirectional predicates', async () => {
    const user = await createTestUser({ administrator: true })
    const postA = await createTestPost()
    const postB = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
    )!

    // Create both directions
    await upsertEntityRelation(user!, metadata, postA, [postB])

    // Verify both exist
    const forwardBefore = (await getEntityRelation(
      'relation__post__related__post',
      postA.id,
      postB.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(forwardBefore[0].deleted_at).toBeNull()

    const reverseBefore = (await getEntityRelation(
      'relation__post__related__post',
      postB.id,
      postA.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(reverseBefore[0].deleted_at).toBeNull()

    // Delete A -> B
    await softDeleteEntityRelation(user!, metadata, postA, [postB])

    // A -> B should be deleted
    const forwardAfter = (await getEntityRelation(
      'relation__post__related__post',
      postA.id,
      postB.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(forwardAfter[0].deleted_at).not.toBeNull()

    // B -> A should also be deleted (bidirectional)
    const reverseAfter = (await getEntityRelation(
      'relation__post__related__post',
      postB.id,
      postA.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(reverseAfter[0].deleted_at).not.toBeNull()
  })

  it('upsertEntityRelation succeeds and relation is queryable when object_type is url', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const url = await insertTestUrlDirect(
      user!.id,
      'https://upsert-bidirectional-url-test.example.com/page',
    )
    expect(url).toBeTruthy()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'url' && m.predicate === 'related',
    )!

    await upsertEntityRelation(user!, metadata, post, [{ id: url!.id }])

    const rows = await getEntityRelation('relation__post__related__url', post.id, url!.id)
    expect(rows.length).toBe(1)
    expect((rows[0] as { deleted_at: Date | null }).deleted_at).toBeNull()
  })

  it('upsertEntityRelation does not create reverse for non-bidirectional predicates', async () => {
    const user = await createTestUser({ administrator: true })
    const postA = await createTestPost()
    const postB = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'mentioned',
    )!
    expect(metadata.bidirectional).toBe(false)

    await upsertEntityRelation(user!, metadata, postA, [postB])

    // Forward exists
    const forwardRows = await getEntityRelation(
      'relation__post__mentioned__post',
      postA.id,
      postB.id,
    )
    expect(forwardRows.length).toBe(1)

    // Reverse does NOT exist
    const reverseRows = await getEntityRelation(
      'relation__post__mentioned__post',
      postB.id,
      postA.id,
    )
    expect(reverseRows.length).toBe(0)
  })

  it('upsertEntityRelation bidirectional re-upserts both directions', async () => {
    const user = await createTestUser({ administrator: true })
    const postA = await createTestPost()
    const postB = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'post' && m.predicate === 'related',
    )!

    // Create, delete, then re-upsert
    await upsertEntityRelation(user!, metadata, postA, [postB])
    await softDeleteEntityRelation(user!, metadata, postA, [postB])

    // Verify both deleted
    const forwardDeleted = (await getEntityRelation(
      'relation__post__related__post',
      postA.id,
      postB.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(forwardDeleted[0].deleted_at).not.toBeNull()

    // Re-upsert - should restore both
    await upsertEntityRelation(user!, metadata, postA, [postB])

    const forwardRestored = (await getEntityRelation(
      'relation__post__related__post',
      postA.id,
      postB.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(forwardRestored[0].deleted_at).toBeNull()

    const reverseRestored = (await getEntityRelation(
      'relation__post__related__post',
      postB.id,
      postA.id,
    )) as Array<{ deleted_at: Date | null }>
    expect(reverseRestored[0].deleted_at).toBeNull()
  })
})
