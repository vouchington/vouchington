import { describe, expect, it, beforeAll } from 'vitest'

import {
  createTestUser,
  insertTestPost,
  suspendTestUser,
  unsuspendTestUser,
  getPostIdsByPrivacyFilter,
} from '@voucha/test-helpers'

import type { BasicUser } from '@services/users/types'

import { buildPrivacyFilter } from '@modules/feed-query-builders/privacy-filter'

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
    const ids = await getPostIdsByPrivacyFilter(null)

    expect(ids).not.toContain(suspendedPostId)
    expect(ids).toContain(regularPostId)
  })

  it('treats an omitted viewer as anonymous', async () => {
    const ids = await getPostIdsByPrivacyFilter()
    expect(ids).not.toContain(suspendedPostId)
    expect(ids).toContain(regularPostId)
  })

  it("excludes suspended users' posts from logged-in non-admin queries", async () => {
    const ids = await getPostIdsByPrivacyFilter(viewer as BasicUser)

    expect(ids).not.toContain(suspendedPostId)
    expect(ids).toContain(regularPostId)
  })

  it("shows suspended user's own posts to themselves", async () => {
    const ids = await getPostIdsByPrivacyFilter(suspendedUser as BasicUser)

    expect(ids).toContain(suspendedPostId)
  })

  it('shows posts from suspended users to admins (null filter)', async () => {
    const filter = buildPrivacyFilter('posts', admin as BasicUser)

    // Admins get null filter — no restriction
    expect(filter).toBeNull()
    const ids = await getPostIdsByPrivacyFilter(admin as BasicUser)
    expect(ids).toContain(suspendedPostId)
    expect(ids).toContain(regularPostId)
  })

  it('shows posts from suspended users after unsuspend', async () => {
    await unsuspendTestUser(suspendedUser!.id)

    const ids = await getPostIdsByPrivacyFilter(null)

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
    const ids = await getPostIdsByPrivacyFilter(null)

    expect(ids).not.toContain(pendingPostId)
    expect(ids).toContain(approvedPostId)
  })

  it('hides pending post from other logged-in users', async () => {
    const ids = await getPostIdsByPrivacyFilter(other as BasicUser)

    expect(ids).not.toContain(pendingPostId)
    expect(ids).toContain(approvedPostId)
  })

  it('shows pending post to its creator', async () => {
    const ids = await getPostIdsByPrivacyFilter(creator as BasicUser)

    expect(ids).toContain(pendingPostId)
    expect(ids).toContain(approvedPostId)
  })

  it('returns null filter for admins (sees all posts)', async () => {
    const filter = buildPrivacyFilter('posts', admin as BasicUser)

    expect(filter).toBeNull()
    const ids = await getPostIdsByPrivacyFilter(admin as BasicUser)
    expect(ids).toContain(pendingPostId)
    expect(ids).toContain(approvedPostId)
  })
})
