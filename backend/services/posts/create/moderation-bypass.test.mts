import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { createPostRevision } from '@services/post-revisions'
import { setPostClearanceStatus } from '@services/post-clearance/update-status'
import { addUserRole } from '@services/users/roles-permissions'
import { hasPostCreationModerationBypass } from './moderation-bypass.mts'

describe('hasPostCreationModerationBypass', () => {
  it('keeps the creation bypass after a later clearance change', async () => {
    const administrator = await createTestUser({ administrator: true })
    const postId = await insertTestPost({
      title: `Admin bypass persistence ${crypto.randomUUID()}`,
      slug: `admin-bypass-persistence-${crypto.randomUUID()}`,
      createdById: administrator.id,
      markdown: 'Admin-created post body',
      clearanceStatus: 'pending',
    })
    await setPostClearanceStatus(postId, 'approved', administrator.id, undefined, {
      creation_moderation_bypassed: true,
    })
    await setPostClearanceStatus(postId, 'rejected', administrator.id)

    await expect(hasPostCreationModerationBypass(postId)).resolves.toBe(true)
  })

  it('does not infer a creation bypass from ordinary clearance changes', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `Ordinary clearance ${crypto.randomUUID()}`,
      slug: `ordinary-clearance-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'Ordinary post body',
      clearanceStatus: 'approved',
    })

    await expect(hasPostCreationModerationBypass(postId)).resolves.toBe(false)
  })

  it('does not infer a bypass when the author became an administrator after creation', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `Post before administrator role ${crypto.randomUUID()}`,
      slug: `post-before-administrator-role-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'Post created before administrator role assignment.',
      clearanceStatus: 'pending',
      createdAt: new Date(Date.now() - 60_000),
    })
    await createPostRevision(postId, 'create', {}, user.id)
    await setPostClearanceStatus(postId, 'approved', user.id)
    await addUserRole(user.id, 'administrator')

    await expect(hasPostCreationModerationBypass(postId)).resolves.toBe(false)
  })

  it('uses an explicit false marker instead of legacy administrator inference', async () => {
    const administrator = await createTestUser({ administrator: true })
    const postId = await insertTestPost({
      title: `Explicit non-bypass ${crypto.randomUUID()}`,
      slug: `explicit-non-bypass-${crypto.randomUUID()}`,
      createdById: administrator.id,
      markdown: 'Explicitly non-bypassed post body',
      clearanceStatus: 'pending',
    })
    await createPostRevision(postId, 'create', {}, administrator.id)
    await setPostClearanceStatus(postId, 'approved', administrator.id, undefined, {
      creation_moderation_bypassed: false,
    })

    await expect(hasPostCreationModerationBypass(postId)).resolves.toBe(false)
  })
})
