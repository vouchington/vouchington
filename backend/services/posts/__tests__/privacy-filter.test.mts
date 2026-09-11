import { describe, expect, it, beforeAll } from 'vitest'

import {
  createTestUser,
  insertTestPost,
  suspendTestUser,
  unsuspendTestUser,
  getPostIdsByPrivacyFilter,
} from '@voucha/test-helpers'

import type { BasicUser } from '@services/users/types'

import { buildPrivacyFilter } from '../privacy-filter.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('buildPrivacyFilter — suspended user exclusion', () => {
  let suspendedUser: Awaited<ReturnType<typeof createTestUser>>
  let regularUser: Awaited<ReturnType<typeof createTestUser>>
  let viewer: Awaited<ReturnType<typeof createTestUser>>
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let suspendedPostId: string
  let regularPostId: string

  beforeAll(async () => {
    const suffix = randomSuffix()
    suspendedUser = await createTestUser({ username: `pf-suspended-${suffix}` })
    regularUser = await createTestUser({ username: `pf-regular-${suffix}` })
    viewer = await createTestUser({ username: `pf-viewer-${suffix}` })
    admin = await createTestUser({ administrator: true })

    suspendedPostId = await insertTestPost({
      createdById: suspendedUser!.id,
      title: `suspended post ${suffix}`,
      slug: `suspended-post-${suffix}`,
      markdown: 'test',
    })

    regularPostId = await insertTestPost({
      createdById: regularUser!.id,
      title: `regular post ${suffix}`,
      slug: `regular-post-${suffix}`,
      markdown: 'test',
    })

    await suspendTestUser(suspendedUser!.id)
  })

  it("excludes suspended users' posts from anonymous queries", async () => {
    const filter = buildPrivacyFilter('posts', null)
    const ids = await getPostIdsByPrivacyFilter(filter)

    expect(ids).not.toContain(suspendedPostId)
    expect(ids).toContain(regularPostId)
  })

  it("excludes suspended users' posts from logged-in non-admin queries", async () => {
    const filter = buildPrivacyFilter('posts', viewer as BasicUser)
    const ids = await getPostIdsByPrivacyFilter(filter)

    expect(ids).not.toContain(suspendedPostId)
    expect(ids).toContain(regularPostId)
  })

  it("shows suspended user's own posts to themselves", async () => {
    const filter = buildPrivacyFilter('posts', suspendedUser as BasicUser)
    const ids = await getPostIdsByPrivacyFilter(filter)

    expect(ids).toContain(suspendedPostId)
  })

  it('shows posts from suspended users to admins (null filter)', () => {
    const filter = buildPrivacyFilter('posts', admin as BasicUser)

    // Admins get null filter — no restriction
    expect(filter).toBeNull()
  })

  it('shows posts from suspended users after unsuspend', async () => {
    await unsuspendTestUser(suspendedUser!.id)

    const filter = buildPrivacyFilter('posts', null)
    const ids = await getPostIdsByPrivacyFilter(filter)

    expect(ids).toContain(suspendedPostId)

    // Re-suspend for other tests that may run after
    await suspendTestUser(suspendedUser!.id)
  })
})

describe('buildPrivacyFilter — clearance_status filtering', () => {
  let creator: Awaited<ReturnType<typeof createTestUser>>
  let other: Awaited<ReturnType<typeof createTestUser>>
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let pendingPostId: string
  let approvedPostId: string

  beforeAll(async () => {
    const suffix = randomSuffix()
    creator = await createTestUser({ username: `pf-cl-creator-${suffix}` })
    other = await createTestUser({ username: `pf-cl-other-${suffix}` })
    admin = await createTestUser({ username: `pf-cl-admin-${suffix}`, administrator: true })

    pendingPostId = await insertTestPost({
      createdById: creator!.id,
      title: `pending clearance post ${suffix}`,
      slug: `pending-clearance-post-${suffix}`,
      markdown: 'test',
      clearanceStatus: 'pending',
    })

    approvedPostId = await insertTestPost({
      createdById: creator!.id,
      title: `approved clearance post ${suffix}`,
      slug: `approved-clearance-post-${suffix}`,
      markdown: 'test',
      clearanceStatus: 'approved',
    })
  })

  it('hides pending post from logged-out users', async () => {
    const filter = buildPrivacyFilter('posts', null)
    const ids = await getPostIdsByPrivacyFilter(filter)

    expect(ids).not.toContain(pendingPostId)
    expect(ids).toContain(approvedPostId)
  })

  it('hides pending post from other logged-in users', async () => {
    const filter = buildPrivacyFilter('posts', other as BasicUser)
    const ids = await getPostIdsByPrivacyFilter(filter)

    expect(ids).not.toContain(pendingPostId)
    expect(ids).toContain(approvedPostId)
  })

  it('shows pending post to its creator', async () => {
    const filter = buildPrivacyFilter('posts', creator as BasicUser)
    const ids = await getPostIdsByPrivacyFilter(filter)

    expect(ids).toContain(pendingPostId)
    expect(ids).toContain(approvedPostId)
  })

  it('returns null filter for admins (sees all posts)', () => {
    const filter = buildPrivacyFilter('posts', admin as BasicUser)

    expect(filter).toBeNull()
  })
})
