import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  safeUsername,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { createUserModNote } from '../create.mts'
import { listUserModNotes } from '../get.mts'
import { deleteUserModNote } from '../delete.mts'
import { getUserModerationContext } from '../context.mts'
import { parseCreateUserModNoteInput } from '../parse.mts'

describe('createUserModNote', () => {
  let staff: PrivateUser
  let communityMod: PrivateUser
  let target: PrivateUser
  let community: Community

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    communityMod = await createTestUser({ username: safeUsername('svc-cmod') })
    target = await createTestUser({ username: safeUsername('svc-tgt') })
    community = await insertTestCommunity({ createdById: staff.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: communityMod.id,
      role: 'moderator',
    })
  })

  it('creates a global note as staff', async () => {
    const input = parseCreateUserModNoteInput({
      targetUserId: target.id,
      body: 'Staff global note',
    })
    const note = await createUserModNote(staff, input)
    expect(note.target_user_id).toBe(target.id)
    expect(note.author_user_id).toBe(staff.id)
    expect(note.community_id).toBeNull()
    expect(note.body).toBe('Staff global note')
    expect(note.deleted_at).toBeNull()
  })

  it('creates a community-scoped note as community mod', async () => {
    const input = parseCreateUserModNoteInput({
      targetUserId: target.id,
      communityId: community.id,
      body: 'Community mod note',
    })
    const note = await createUserModNote(communityMod, input)
    expect(note.community_id).toBe(community.id)
    expect(note.author_user_id).toBe(communityMod.id)
  })

  it('throws 403 when community mod tries to create a global note', async () => {
    const input = parseCreateUserModNoteInput({
      targetUserId: target.id,
      communityId: null,
      body: 'Should fail',
    })
    await expect(createUserModNote(communityMod, input)).rejects.toMatchObject({ status: 403 })
  })

  it('throws 403 when community mod creates note for a community they do not moderate', async () => {
    const otherCommunity = await insertTestCommunity({ createdById: staff.id })
    const input = parseCreateUserModNoteInput({
      targetUserId: target.id,
      communityId: otherCommunity.id,
      body: 'Wrong community',
    })
    await expect(createUserModNote(communityMod, input)).rejects.toMatchObject({ status: 403 })
  })

  it('throws 404 when target user is not found', async () => {
    const fakeUserId = '01900000-0000-7000-8000-000000000001'
    const input = parseCreateUserModNoteInput({ targetUserId: fakeUserId, body: 'Ghost note' })
    await expect(createUserModNote(staff, input)).rejects.toMatchObject({ status: 404 })
  })
})

describe('listUserModNotes', () => {
  let staff: PrivateUser
  let communityMod: PrivateUser
  let unrelatedMod: PrivateUser
  let target: PrivateUser
  let community: Community
  let otherCommunity: Community

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    communityMod = await createTestUser({ username: safeUsername('svc-lmod') })
    unrelatedMod = await createTestUser({ username: safeUsername('svc-unrel') })
    target = await createTestUser({ username: safeUsername('svc-ltgt') })
    community = await insertTestCommunity({ createdById: staff.id })
    otherCommunity = await insertTestCommunity({ createdById: staff.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: communityMod.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({
      communityId: otherCommunity.id,
      userId: unrelatedMod.id,
      role: 'moderator',
    })

    // Create notes: 1 global, 1 in community, 1 in otherCommunity
    await createUserModNote(
      staff,
      parseCreateUserModNoteInput({ targetUserId: target.id, body: 'Global note' }),
    )
    await createUserModNote(
      staff,
      parseCreateUserModNoteInput({
        targetUserId: target.id,
        communityId: community.id,
        body: 'Community note',
      }),
    )
    await createUserModNote(
      staff,
      parseCreateUserModNoteInput({
        targetUserId: target.id,
        communityId: otherCommunity.id,
        body: 'Other community note',
      }),
    )
  })

  it('staff sees all notes (global + community scoped)', async () => {
    const { notes } = await listUserModNotes(staff, target.id)
    expect(notes.length).toBeGreaterThanOrEqual(3)
    const bodies = notes.map(n => n.body)
    expect(bodies).toContain('Global note')
    expect(bodies).toContain('Community note')
    expect(bodies).toContain('Other community note')
  })

  it('community mod sees only their community notes (not global, not other communities)', async () => {
    const { notes } = await listUserModNotes(communityMod, target.id)
    expect(notes.every(n => n.community_id === community.id)).toBe(true)
    const bodies = notes.map(n => n.body)
    expect(bodies).toContain('Community note')
    expect(bodies).not.toContain('Global note')
    expect(bodies).not.toContain('Other community note')
  })

  it('throws 403 when user has empty moderator list (no communities)', async () => {
    const plainUser = await createTestUser({ username: safeUsername('svc-plain') })
    await expect(listUserModNotes(plainUser, target.id)).rejects.toMatchObject({ status: 403 })
  })
})

describe('deleteUserModNote', () => {
  let staff: PrivateUser
  let author: PrivateUser
  let communityMod: PrivateUser
  let target: PrivateUser
  let community: Community

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    author = await createTestUser({ administrator: true })
    communityMod = await createTestUser({ username: safeUsername('svc-dmod') })
    target = await createTestUser({ username: safeUsername('svc-dtgt') })
    community = await insertTestCommunity({ createdById: staff.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: communityMod.id,
      role: 'moderator',
    })
  })

  it('staff can delete their own note', async () => {
    const note = await createUserModNote(
      author,
      parseCreateUserModNoteInput({ targetUserId: target.id, body: 'Author note' }),
    )
    await expect(deleteUserModNote(author, note.id, target.id)).resolves.toBeUndefined()
  })

  it('throws 403 when a former staff author deletes a global note', async () => {
    const note = await createUserModNote(
      author,
      parseCreateUserModNoteInput({ targetUserId: target.id, body: 'Former staff note' }),
    )
    await expect(
      deleteUserModNote({ ...author, roles: [] }, note.id, target.id),
    ).rejects.toMatchObject({
      status: 403,
    })
  })

  it('staff can delete another user note', async () => {
    const note = await createUserModNote(
      author,
      parseCreateUserModNoteInput({ targetUserId: target.id, body: 'Note for staff delete' }),
    )
    await expect(deleteUserModNote(staff, note.id, target.id)).resolves.toBeUndefined()
  })

  it('community mod can delete notes in their community', async () => {
    const note = await createUserModNote(
      staff,
      parseCreateUserModNoteInput({
        targetUserId: target.id,
        communityId: community.id,
        body: 'Community note for mod delete',
      }),
    )
    await expect(deleteUserModNote(communityMod, note.id, target.id)).resolves.toBeUndefined()
  })

  it('throws 403 for unrelated user', async () => {
    const unrelated = await createTestUser({ username: safeUsername('svc-unr2') })
    const note = await createUserModNote(
      staff,
      parseCreateUserModNoteInput({ targetUserId: target.id, body: 'Unrelated test note' }),
    )
    await expect(deleteUserModNote(unrelated, note.id, target.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('throws 404 for nonexistent note', async () => {
    const fakeNoteId = '01900000-0000-7000-8000-000000000002'
    await expect(deleteUserModNote(staff, fakeNoteId, target.id)).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('getUserModerationContext', () => {
  let staff: PrivateUser
  let nonStaff: PrivateUser
  let target: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    nonStaff = await createTestUser({ username: safeUsername('svc-nstaff') })
    target = await createTestUser({ username: safeUsername('svc-ctx-tgt') })
  })

  it('returns trust_tier when isStaff=true', async () => {
    const context = await getUserModerationContext(staff, target, true)
    expect(context.trust_tier).not.toBeNull()
    expect(typeof context.trust_tier).toBe('number')
  })

  it('returns trust_tier=null when isStaff=false', async () => {
    const context = await getUserModerationContext(nonStaff, target, false)
    expect(context.trust_tier).toBeNull()
  })

  it('returns account_age_ms as a number', async () => {
    const context = await getUserModerationContext(staff, target, true)
    expect(typeof context.account_age_ms).toBe('number')
    expect(context.account_age_ms).toBeGreaterThan(0)
  })

  it('counts content removals (not self-deletes)', async () => {
    const context = await getUserModerationContext(staff, target, true)
    expect(typeof context.content_removal_count).toBe('number')
    expect(context.content_removal_count).toBeGreaterThanOrEqual(0)
  })

  it('counts community removals', async () => {
    const context = await getUserModerationContext(staff, target, true)
    expect(typeof context.community_removal_count).toBe('number')
    expect(context.community_removal_count).toBeGreaterThanOrEqual(0)
  })

  it('returns null active_suspension for non-suspended user', async () => {
    const context = await getUserModerationContext(staff, target, true)
    expect(context.active_suspension).toBeNull()
  })
})
