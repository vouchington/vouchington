import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createUserModNote } from './create.mts'
import { deleteUserModNote } from './delete.mts'
import { listUserModNotes } from './get.mts'
import { parseCreateUserModNoteInput } from './parse.mts'

describe('moderator note deletion in a borrowed transaction', () => {
  it('sees an uncommitted moderator membership and rolls back the deletion', async () => {
    const [staff, moderator, target] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])
    const community = await insertTestCommunity({ createdById: staff.id })
    const note = await createUserModNote(
      staff,
      parseCreateUserModNoteInput({
        targetUserId: target.id,
        communityId: community.id,
        body: `Borrowed transaction ${crypto.randomUUID()}`,
      }),
    )
    {
      await using query = await beginTransaction()
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
        query,
      })
      await expect(
        deleteUserModNote(moderator, note.id, target.id, { query }),
      ).resolves.toBeUndefined()
    }
    const { notes } = await listUserModNotes(staff, target.id)
    expect(notes.map(row => row.id)).toContain(note.id)
  })
})
