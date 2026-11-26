import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestVerifiedIdentity,
  setUserVerificationFields,
  softDeleteUser,
} from '@voucha/test-helpers'
import { createUserModNote } from '../create.mts'
import { listUserModNotes } from '../get.mts'
import { parseCreateUserModNoteInput } from '../parse.mts'

describe('listUserModNotes author projection', () => {
  it('shows public author details and keeps the note after author deletion', async () => {
    const staff = await createTestUser({ administrator: true })
    const author = await createTestUser({ administrator: true })
    const noteTarget = await createTestUser()
    const fingerprint = randomBytes(32).toString('hex')
    await insertTestVerifiedIdentity(author.id, fingerprint, `vs_${randomUUID()}`)
    await setUserVerificationFields(author.id, {
      verificationStatus: 'verified',
      verifiedBadgeVisible: true,
      publicVerifiedNameDisplay: 'first_name_last_initial',
      verifiedFirstName: 'Alice',
      verifiedLastNameInitial: 'S',
    })
    const note = await createUserModNote(
      author,
      parseCreateUserModNoteInput({ targetUserId: noteTarget.id, body: 'Author projection' }),
    )
    expect(note).toMatchObject({
      author_username: author.username,
      author_display_name: 'Alice S.',
    })
    const visible = await listUserModNotes(staff, noteTarget.id)
    expect(visible.notes.find(row => row.id === note.id)).toMatchObject({
      author_user_id: author.id,
      author_username: author.username,
      author_display_name: 'Alice S.',
    })

    await setUserVerificationFields(author.id, { verifiedBadgeVisible: false })
    const hiddenNote = await createUserModNote(
      author,
      parseCreateUserModNoteInput({
        targetUserId: noteTarget.id,
        body: 'Hidden author projection',
      }),
    )
    expect(hiddenNote).toMatchObject({
      author_username: author.username,
      author_display_name: null,
    })
    const hidden = await listUserModNotes(staff, noteTarget.id)
    expect(hidden.notes.find(row => row.id === note.id)).toMatchObject({
      author_user_id: author.id,
      author_username: author.username,
      author_display_name: null,
    })

    await softDeleteUser(author.id)
    const deleted = await listUserModNotes(staff, noteTarget.id)
    expect(deleted.notes.find(row => row.id === note.id)).toMatchObject({
      author_user_id: author.id,
      author_username: null,
      author_display_name: null,
    })
  })
})
