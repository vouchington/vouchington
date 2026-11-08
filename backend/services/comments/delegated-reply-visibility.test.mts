import { describe, expect, it } from 'vitest'
import { createTestUser, createTestMembership, insertTestPost } from '@voucha/test-helpers'
import {
  withHeldPostUpdateForTest,
  withUncommittedPostHideForTest,
} from '@voucha/test-helpers/post-write-context'
import { WEB_PROVENANCE } from '@voucha/test-helpers/entities/content-provenance'
import { preparePostWithCommunityReviews } from '../posts/prepare-post-with-community-reviews.mts'
import { getVisibleCommentDescendantIdsPage } from './descendant-ids.mts'

describe('delegated replies and read-time subtree visibility', () => {
  it('collapses a reply created while its parent hide is uncommitted', async () => {
    const user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const root = await insertTestPost({
      title: 'Root',
      slug: crypto.randomUUID(),
      markdown: '',
      createdById: user.id,
    })
    const parent = await insertTestPost({
      postType: 'comment',
      title: '',
      slug: crypto.randomUUID(),
      markdown: 'Parent',
      createdById: user.id,
      rootId: root,
      parentId: root,
    })
    const prepared = await withHeldPostUpdateForTest(root, () =>
      withUncommittedPostHideForTest(user.id, parent, () =>
        preparePostWithCommunityReviews(
          user,
          WEB_PROVENANCE,
          { post_type: 'comment', parent_post_id: parent, markdown: 'Concurrent reply' },
          'plus',
          { delegated: true },
        ),
      ),
    )
    await prepared.finalize()
    expect(prepared.response.post.parent_post_id).toBe(parent)
    const collapsed = await getVisibleCommentDescendantIdsPage(user, root, root, { limit: 10 })
    expect(collapsed.results).toEqual([parent])
    const expanded = await getVisibleCommentDescendantIdsPage(user, root, parent, { limit: 10 })
    expect(expanded.results).toEqual([prepared.response.post.id])
  })
})
