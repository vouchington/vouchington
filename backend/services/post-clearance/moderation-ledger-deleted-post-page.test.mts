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

  it('advances past two ineligible versions before a live version', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postClearanceWorkConfig, {
        reconciliation_batch_size: 1,
      }),
    )
    const user = await createTestUser()
    const firstDeletedPostId = await insertTestPost({
      title: `ledger-deleted-a-${crypto.randomUUID()}`,
      slug: `ledger-deleted-a-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: user.id,
      clearanceStatus: 'pending',
    })
    const secondDeletedPostId = await insertTestPost({
      title: `ledger-deleted-b-${crypto.randomUUID()}`,
      slug: `ledger-deleted-b-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: user.id,
      clearanceStatus: 'pending',
    })
    const livePostId = await insertTestPost({
      title: `ledger-live-after-${crypto.randomUUID()}`,
      slug: `ledger-live-after-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: user.id,
      clearanceStatus: 'pending',
    })
    await ensureCurrentPostModerationVersion(firstDeletedPostId)
    const secondDeletedVersion = await ensureCurrentPostModerationVersion(secondDeletedPostId)
    const liveVersion = await ensureCurrentPostModerationVersion(livePostId)
    await deleteTestPost(firstDeletedPostId)
    await deleteTestPost(secondDeletedPostId)
    await expireTestPostModerationVersion(secondDeletedVersion.id)
    await expireTestPostModerationVersion(liveVersion.id)

    const first = await reconcilePostModerationWork(1, [
      firstDeletedPostId,
      secondDeletedPostId,
      livePostId,
    ])
    expect(first.due).toEqual([])
    expect(first.nextCursor?.afterVersionId).toBe(secondDeletedVersion.id)
    expect(first.nextCursor?.afterSource).toBe('spam_detection')

    let cursor = first.nextCursor
    const cursors = [`${cursor?.afterVersionId}:${cursor?.afterSource}`]
    let finished = false
    for (let step = 0; step < 8; step++) {
      const page = await reconcilePostModerationWork(
        1,
        [firstDeletedPostId, secondDeletedPostId, livePostId],
        cursor,
      )
      if (page.nextCursor) {
        cursors.push(`${page.nextCursor.afterVersionId}:${page.nextCursor.afterSource}`)
      }
      if (!page.hasMore) {
        finished = true
        break
      }
      cursor = page.nextCursor
    }

    expect(new Set(cursors).size).toBe(cursors.length)
    expect(finished).toBe(true)
    expect(await countTestPostModerationIncompleteWork(livePostId)).toBe(0)
  })
})
