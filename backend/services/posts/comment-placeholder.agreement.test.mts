import { describe, expect, it } from 'vitest'
import { isModerationStaff } from '@services/users/authorization'
import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import {
  readTestCommentSqlValidity,
  readTestCommentStateRow,
} from '@voucha/test-helpers/comment-placeholder-validity'
import { getCommentPlaceholderState } from './comment-placeholder.mts'

// The walk decides validity in SQL and the response is masked in TypeScript; they must agree for
// every comment state and every kind of viewer.
describe('comment placeholder state agreement', () => {
  it('marks a comment valid in SQL exactly when TypeScript gives it no placeholder state', async () => {
    const author = await createTestUser()
    const other = await createTestUser()
    const moderator = { ...(await createTestUser()), roles: ['moderator' as const] }
    const root = await createTestPost({ user: author })
    const comment = (user: typeof author) =>
      createTestPost({
        user,
        post_type: 'comment',
        parent_post_id: root.id,
        root_post_id: root.id,
      })
    const live = await comment(author)
    const deleted = await comment(author)
    const pending = await comment(author)
    const pendingDeleted = await comment(author)
    await deleteTestPost(deleted.id)
    await setTestPostClearanceStatus(pending.id, 'pending', author.id)
    await setTestPostClearanceStatus(pendingDeleted.id, 'pending', author.id)
    await deleteTestPost(pendingDeleted.id)

    const viewers = [null, author, other, moderator]
    for (const post of [live, deleted, pending, pendingDeleted]) {
      const row = await readTestCommentStateRow(post.id)
      for (const viewer of viewers) {
        const options = {
          currentUserId: viewer?.id ?? null,
          isModerationStaff: isModerationStaff(viewer),
        }
        const valid = await readTestCommentSqlValidity(post.id, options)
        const expected = getCommentPlaceholderState(row, viewer) === null
        expect({ post: post.id, viewer: viewer?.id ?? null, valid }).toEqual({
          post: post.id,
          viewer: viewer?.id ?? null,
          valid: expected,
        })
      }
    }
  })
})
