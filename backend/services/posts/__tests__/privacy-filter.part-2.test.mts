import { beforeAll, describe, expect, it } from 'vitest'
import type { SQLStatement } from 'sql-template-strings'

import {
  createTestUser,
  deleteTestPost,
  getPostIdsByPrivacyFilter,
  insertTestPost,
} from '@voucha/test-helpers'
import type { BasicUser } from '@services/users/types'
import { canViewPost } from '../check-privacy-access.mts'
import { getPostByAny } from '../get.mts'
import { buildPrivacyFilter } from '../privacy-filter.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('buildPrivacyFilter — soft-deleted root', () => {
  let viewer: Awaited<ReturnType<typeof createTestUser>>
  let commenter: Awaited<ReturnType<typeof createTestUser>>
  let rootAuthor: Awaited<ReturnType<typeof createTestUser>>
  let deletedRootId: string
  let commentOnDeletedRootId: string
  let liveRootId: string
  let commentOnLiveRootId: string

  beforeAll(async () => {
    const suffix = randomSuffix()
    viewer = await createTestUser({ username: `pf-dr-viewer-${suffix}` })
    commenter = await createTestUser({ username: `pf-dr-commenter-${suffix}` })
    rootAuthor = await createTestUser({ username: `pf-dr-root-author-${suffix}` })
    deletedRootId = await insertTestPost({
      createdById: rootAuthor!.id,
      title: `deleted root ${suffix}`,
      slug: `deleted-root-${suffix}`,
      markdown: 'root content',
      broadcast: 'everyone',
      privacy: 'public',
    })
    commentOnDeletedRootId = await insertTestPost({
      createdById: commenter!.id,
      title: `comment on deleted root ${suffix}`,
      slug: `comment-on-deleted-root-${suffix}`,
      markdown: 'comment content',
      postType: 'comment',
      rootId: deletedRootId,
      parentId: deletedRootId,
    })
    liveRootId = await insertTestPost({
      createdById: rootAuthor!.id,
      title: `live root ${suffix}`,
      slug: `live-root-${suffix}`,
      markdown: 'live root content',
      broadcast: 'everyone',
      privacy: 'public',
    })
    commentOnLiveRootId = await insertTestPost({
      createdById: commenter!.id,
      title: `comment on live root ${suffix}`,
      slug: `comment-on-live-root-${suffix}`,
      markdown: 'live comment content',
      postType: 'comment',
      rootId: liveRootId,
      parentId: liveRootId,
    })
    await deleteTestPost(deletedRootId)
  })

  function hidesCommentOnDeletedRoot(
    description: string,
    buildFilter: () => SQLStatement | null,
  ): void {
    it(`hides comment on deleted root from ${description}`, async () => {
      const filter = buildFilter()
      if (!filter) throw new Error('Expected a privacy filter')
      const ids = await getPostIdsByPrivacyFilter(filter)
      expect(ids).not.toContain(commentOnDeletedRootId)
      expect(ids).toContain(commentOnLiveRootId)
    })
  }

  hidesCommentOnDeletedRoot('logged-out users (buildPrivacyFilter)', () =>
    buildPrivacyFilter('posts', null),
  )
  hidesCommentOnDeletedRoot('logged-in non-owner (buildPrivacyFilter)', () =>
    buildPrivacyFilter('posts', viewer as BasicUser),
  )
  hidesCommentOnDeletedRoot('the commenter themselves (buildPrivacyFilter)', () =>
    buildPrivacyFilter('posts', commenter as BasicUser),
  )
})

describe('canViewPost — candidate and root publication state', () => {
  it('does not let an approved root expose a pending comment to other viewers', async () => {
    const suffix = randomSuffix()
    const rootAuthor = await createTestUser({ username: `direct-root-${suffix}` })
    const commenter = await createTestUser({ username: `direct-commenter-${suffix}` })
    const viewer = await createTestUser({ username: `direct-viewer-${suffix}` })
    const moderator = await createTestUser({
      username: `direct-moderator-${suffix}`,
      extraRoles: ['moderator'],
    })
    const administrator = await createTestUser({
      username: `direct-admin-${suffix}`,
      administrator: true,
    })
    if (!rootAuthor || !commenter || !viewer || !moderator || !administrator)
      throw new Error('Failed to create test users')
    const rootId = await insertTestPost({
      createdById: rootAuthor.id,
      title: `approved root ${suffix}`,
      slug: `approved-root-${suffix}`,
      markdown: 'root',
    })
    const commentId = await insertTestPost({
      createdById: commenter.id,
      title: `pending comment ${suffix}`,
      slug: `pending-comment-${suffix}`,
      markdown: 'comment',
      postType: 'comment',
      rootId,
      parentId: rootId,
      clearanceStatus: 'pending',
    })
    const comment = await getPostByAny(commentId)
    if (!comment) throw new Error('Failed to load test comment')
    await expect(canViewPost(null, comment)).resolves.toBe(false)
    await expect(canViewPost(viewer, comment)).resolves.toBe(false)
    await expect(canViewPost(commenter, comment)).resolves.toBe(true)
    await expect(canViewPost(moderator, comment)).resolves.toBe(true)
    await expect(canViewPost(administrator, comment)).resolves.toBe(true)
  })
})
