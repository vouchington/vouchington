import { describe, expect, it } from 'vitest'
import '../urls/register-blocked-hostname-guard.mts'
import '../referral-program-link-validations/register-referral-link-guard.mts'
import '../posts/register-post-related-urls-guard.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { assertEntityRelationUpsertAllowed } from './assert-upsert-allowed.mts'

describe('entity relation admission dispatch', () => {
  it('keeps the parent-cycle guard on topic parent relations', async () => {
    const creator = await createTestUser()
    const topic = await createTestTopic()
    const parent = await createTestTopic()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'parent',
    })
    await expect(
      assertEntityRelationUpsertAllowed(creator, relation, topic, [topic]),
    ).rejects.toMatchObject({ status: 422, message: 'A topic cannot be its own parent' })
    await expect(
      assertEntityRelationUpsertAllowed(creator, relation, topic, [parent]),
    ).resolves.toBeUndefined()
  })

  it('keeps source eligibility and user-tag guards separate from ordinary topic relations', async () => {
    const creator = await createTestUser()
    const subject = await createTestTopic()
    const object = await createTestTopic()
    const publisherRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })
    await expect(
      assertEntityRelationUpsertAllowed(creator, publisherRelation, subject, [object]),
    ).rejects.toMatchObject({ status: 422, message: 'Publisher type tags require a Source topic' })
    const userTagRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'topic',
      predicate: 'category',
    })
    await expect(
      assertEntityRelationUpsertAllowed(creator, userTagRelation, creator, [object]),
    ).rejects.toMatchObject({ status: 422, message: 'Invalid user tag' })
    const relatedRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'related',
    })
    await expect(
      assertEntityRelationUpsertAllowed(creator, relatedRelation, subject, [object]),
    ).resolves.toBeUndefined()
  })

  it('admits a valid post-related URL through its owning guards', async () => {
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator })
    const url = await insertTestUrlDirect(
      creator.id,
      `https://example.com/admission-${crypto.randomUUID()}`,
    )
    expect(url).toBeTruthy()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })
    await expect(
      assertEntityRelationUpsertAllowed(creator, relation, post, [url!]),
    ).resolves.toBeUndefined()
  })

  it('keeps the non-null creator gate on URL relations', async () => {
    const subject = await createTestTopic()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'url',
      predicate: 'related',
    })
    await expect(
      assertEntityRelationUpsertAllowed(null, relation, subject, []),
    ).rejects.toMatchObject({
      status: 500,
      message: 'URL-object entity relations require a non-null creator',
    })
  })
})
