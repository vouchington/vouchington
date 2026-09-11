import { describe, it, expect, beforeAll } from 'vitest'
import { createPost } from '../create.mts'
import { lockPost } from '../lock.mts'
import { createTestUser, createRandomString, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('create: locked thread enforcement', () => {
  let creator: PrivateUser
  let commenter: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
    commenter = await createTestUser()
  })

  function makeSlug() {
    return `locked-thread-${createRandomString(8)}`
  }

  it('rejects direct reply when root post is locked', async () => {
    const root = await createPost(creator, {
      title: 'Locked root post',
      markdown: 'root content',
      post_type: 'discussion',
      broadcast: 'everyone',
      privacy: 'public',
    })

    await lockPost(root.id, creator.id)

    await expect(
      createPost(commenter, {
        markdown: 'blocked reply',
        post_type: 'comment',
        parent_id: root.id,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'This thread is locked',
      code: 'POST_THREAD_LOCKED',
    })
  })

  it('rejects nested reply when root post is locked', async () => {
    const root = await createPost(creator, {
      title: 'Root for nested lock test',
      markdown: 'root content',
      post_type: 'discussion',
      broadcast: 'everyone',
      privacy: 'public',
    })

    // insert a direct comment (bypass createPost to avoid the lock check running again)
    const commentId = await insertTestPost({
      title: '',
      slug: makeSlug(),
      createdById: commenter.id,
      markdown: 'first reply',
      postType: 'comment',
      rootId: root.id,
      parentId: root.id,
    })

    await lockPost(root.id, creator.id)

    // trying to reply to the comment when the root is locked should fail
    await expect(
      createPost(commenter, {
        markdown: 'nested blocked reply',
        post_type: 'comment',
        parent_id: commentId,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'This thread is locked',
      code: 'POST_THREAD_LOCKED',
    })
  })

  it('rejects reply when the immediate parent comment is locked', async () => {
    const root = await createPost(creator, {
      title: 'Root for parent comment lock test',
      markdown: 'root content',
      post_type: 'discussion',
      broadcast: 'everyone',
      privacy: 'public',
    })

    const commentId = await insertTestPost({
      title: '',
      slug: makeSlug(),
      createdById: commenter.id,
      markdown: 'locked comment',
      postType: 'comment',
      rootId: root.id,
      parentId: root.id,
    })

    await lockPost(commentId, creator.id)

    await expect(
      createPost(commenter, {
        markdown: 'blocked nested reply',
        post_type: 'comment',
        parent_id: commentId,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'This thread is locked',
      code: 'POST_THREAD_LOCKED',
    })
  })

  // Document intentional scope limitation: locking a non-root comment only blocks
  // direct replies to that comment. Descendants deeper in the subtree (under an
  // unlocked child of the locked comment) can still receive replies unless the root
  // is also locked. This is intentional — no ancestor walk.
  it('allows reply to a child of a locked intermediate comment (scope limitation)', async () => {
    const root = await createPost(creator, {
      title: 'Root for scope-limitation test',
      markdown: 'root content',
      post_type: 'discussion',
      broadcast: 'everyone',
      privacy: 'public',
    })

    const lockedCommentId = await insertTestPost({
      title: '',
      slug: makeSlug(),
      createdById: commenter.id,
      markdown: 'locked intermediate comment',
      postType: 'comment',
      rootId: root.id,
      parentId: root.id,
    })

    const unlockedChildId = await insertTestPost({
      title: '',
      slug: makeSlug(),
      createdById: commenter.id,
      markdown: 'unlocked child of locked comment',
      postType: 'comment',
      rootId: root.id,
      parentId: lockedCommentId,
    })

    await lockPost(lockedCommentId, creator.id)

    // Replying directly to the locked comment is rejected
    await expect(
      createPost(commenter, {
        markdown: 'blocked direct reply',
        post_type: 'comment',
        parent_id: lockedCommentId,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'POST_THREAD_LOCKED' })

    // Replying to the unlocked child (grandchild of root) succeeds: parent is
    // unlocked and root is unlocked — intermediate ancestor not checked.
    await expect(
      createPost(commenter, {
        markdown: 'allowed grandchild reply',
        post_type: 'comment',
        parent_id: unlockedChildId,
      }),
    ).resolves.toBeDefined()
  })

  it('allows reply to unlocked thread', async () => {
    const root = await createPost(creator, {
      title: 'Unlocked root post',
      markdown: 'root content',
      post_type: 'discussion',
      broadcast: 'everyone',
      privacy: 'public',
    })

    await expect(
      createPost(commenter, {
        markdown: 'allowed reply',
        post_type: 'comment',
        parent_id: root.id,
      }),
    ).resolves.toBeDefined()
  })
})
