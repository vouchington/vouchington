import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  appendTestPlatformRejectionNote,
  beginTransaction,
  createTestUser,
  insertTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { getLockedPostImagePublicationState } from './image-publication-state.mts'

describe('getLockedPostImagePublicationState', () => {
  it('selects the owning clearance generation when override IDs share a millisecond', async () => {
    const creator = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Same millisecond override ${suffix}`,
      slug: `same-millisecond-override-${suffix}`,
      createdById: creator.id,
      markdown: 'The current override note must survive image rollback.',
      clearanceStatus: 'pending',
    })
    await setTestPostClearanceStatus(postId, 'approved', creator.id)
    const occurredAt = new Date()
    const olderId = await appendTestPlatformRejectionNote(postId, 'Older note', occurredAt, 20)
    const currentId = await appendTestPlatformRejectionNote(postId, 'Current note', occurredAt, 1)
    expect(olderId.localeCompare(currentId)).toBeGreaterThan(0)

    await using transaction = await beginTransaction()
    const snapshot = await getLockedPostImagePublicationState(transaction, postId)
    expect(snapshot.clearance_private_note).toBe('Current note')
    expect(snapshot.clearance_platform_override).toBe(true)
  })
})
