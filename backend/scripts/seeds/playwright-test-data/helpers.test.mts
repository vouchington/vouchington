import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  appendTestPlatformRejectionNote,
  beginTransaction,
  createTestUser,
  getTestCurrentPostClearance,
  insertTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { approveSeedPosts } from './helpers.mts'

describe('approveSeedPosts', () => {
  it('copies the inserted decision facts onto a post with prior override facts', async () => {
    const actor = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Playwright seed clearance ${suffix}`,
      slug: `playwright-seed-clearance-${suffix}`,
      markdown: 'A seeded post with prior override facts.',
      createdById: actor.id,
      clearanceStatus: 'pending',
    })
    await setTestPostClearanceStatus(postId, 'approved', actor.id)
    await appendTestPlatformRejectionNote(postId, 'Prior staff note')
    expect(await getTestCurrentPostClearance(postId)).toMatchObject({
      clearance_changed_by_id: actor.id,
      clearance_public_reason_code: 'staff_rejected',
      clearance_is_platform_override: true,
    })

    await using transaction = await beginTransaction()
    await approveSeedPosts(transaction, [postId])
    await transaction.commit()
    expect(await getTestCurrentPostClearance(postId)).toMatchObject({
      clearance_changed_by_id: null,
      clearance_public_reason_code: null,
      clearance_is_platform_override: false,
      clearance_status: 'approved',
    })
  })
})
