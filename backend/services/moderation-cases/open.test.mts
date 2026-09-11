import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { openOrGetOpenCase, findOpenCaseForEntity } from './open.mts'

describe('openOrGetOpenCase', () => {
  let user: PrivateUser
  let otherUser: PrivateUser
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
    postId = await insertTestPost({
      createdById: otherUser.id,
      title: 'Open case test post',
      slug: `open-case-test-${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Test post for moderation case',
    })
  })

  it('creates a new case and returns its id for a user entity', async () => {
    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: user.id })
    expect(typeof caseId).toBe('string')
    expect(caseId.length).toBeGreaterThan(0)
  })

  it('returns the same case id on a second call for the same entity (idempotent)', async () => {
    const user2 = await createTestUser()
    const first = await openOrGetOpenCase({ entityType: 'user', entityId: user2.id })
    const second = await openOrGetOpenCase({ entityType: 'user', entityId: user2.id })
    expect(second).toBe(first)
  })

  it('creates a case for a post entity', async () => {
    const caseId = await openOrGetOpenCase({ entityType: 'post', entityId: postId })
    expect(typeof caseId).toBe('string')
    const found = await findOpenCaseForEntity({ entityType: 'post', entityId: postId })
    expect(found?.id).toBe(caseId)
  })

  it('treats post and comment as the same case (both use post_id FK)', async () => {
    const commentPostId = await insertTestPost({
      createdById: otherUser.id,
      title: 'Comment case test',
      slug: `comment-case-test-${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Test post for comment case',
    })
    const postCase = await openOrGetOpenCase({ entityType: 'post', entityId: commentPostId })
    const commentCase = await openOrGetOpenCase({ entityType: 'comment', entityId: commentPostId })
    expect(commentCase).toBe(postCase)
  })
})

describe('findOpenCaseForEntity', () => {
  it('returns null when no open case exists', async () => {
    const freshUser = await createTestUser()
    const found = await findOpenCaseForEntity({ entityType: 'user', entityId: freshUser.id })
    expect(found).toBeNull()
  })

  it('returns the case once opened', async () => {
    const freshUser = await createTestUser()
    const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: freshUser.id })
    const found = await findOpenCaseForEntity({ entityType: 'user', entityId: freshUser.id })
    expect(found?.id).toBe(caseId)
    expect(found?.reported_user_id).toBe(freshUser.id)
    expect(found?.resolved_at).toBeNull()
  })
})
