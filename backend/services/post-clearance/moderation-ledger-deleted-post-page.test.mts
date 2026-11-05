import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestUser,
  deleteTestPost,
  expireTestPostModerationVersion,
  insertTestPost,
} from '@voucha/test-helpers'
import { countTestPostModerationIncompleteWork } from '@voucha/test-helpers/post-moderation-attempt-state'
import {
  ensureCurrentPostModerationVersion,
  reconcilePostModerationWork,
} from './moderation-ledger.mts'
import { postClearanceWorkConfig } from './work-limits.mts'

describe('deleted post moderation pages', () => {
  it('reaches a live post after a deleted post fills the version page', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postClearanceWorkConfig, {
        reconciliation_batch_size: 1,
      }),
    )
    const user = await createTestUser()
    const deletedPostId = await insertTestPost({
      title: `ledger-deleted-${crypto.randomUUID()}`,
      slug: `ledger-deleted-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: user.id,
      clearanceStatus: 'pending',
    })
    const livePostId = await insertTestPost({
      title: `ledger-live-${crypto.randomUUID()}`,
      slug: `ledger-live-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: user.id,
      clearanceStatus: 'pending',
    })
    const deletedVersion = await ensureCurrentPostModerationVersion(deletedPostId)
    const liveVersion = await ensureCurrentPostModerationVersion(livePostId)
    await deleteTestPost(deletedPostId)
    await expireTestPostModerationVersion(deletedVersion.id)
    await expireTestPostModerationVersion(liveVersion.id)

    let cursor: Awaited<ReturnType<typeof reconcilePostModerationWork>>['nextCursor']
    let finished = false
    for (let step = 0; step < 6; step++) {
      const page = await reconcilePostModerationWork(1, [deletedPostId, livePostId], cursor)
      if (!page.hasMore) {
        finished = true
        break
      }
      cursor = page.nextCursor
    }

    expect(finished).toBe(true)
    expect(await countTestPostModerationIncompleteWork(livePostId)).toBe(0)
  })
})
