import { describe, it, expect } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  insertTestBlueskyLinkedAccount,
  getTestBlueskyLinkAttachmentTime,
  softDeleteUser,
  suspendTestUser,
} from '@voucha/test-helpers'
import { connectBlueskyAccountToUser, getBlueskyLinkedAccountForUser } from './connect.mts'
import { v7 } from 'uuid'
import { ensureTestBlueskyLinkAuthorization } from '@voucha/test-helpers/entities/bluesky-link-authorizations'

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

// connectBlueskyAccountToUser only ever attaches user_id/handle to a row that already exists —
// the row itself is created by BlueskySessionStore.set() during the OAuth callback, before
// connect ever runs (see link.mts). Seed it the same way here rather than inserting raw SQL.
async function seedLinkedAccountRow(did: string, linkingUserId: string): Promise<string> {
  const row = await insertTestBlueskyLinkedAccount({ userId: null, did, linkingUserId })
  return row.link_authorization_id
}

describe('connectBlueskyAccountToUser', () => {
  it('attaches the linking user and handle to an existing session row', async () => {
    const user = await createTestUserDirect()
    const did = fakeDid()
    const handle = fakeHandle()
    const authorizationId = await seedLinkedAccountRow(did, user.id)

    await connectBlueskyAccountToUser(user.id, did, handle, {
      linkAuthorizationId: authorizationId,
    })

    const linked = await getBlueskyLinkedAccountForUser(user.id)
    expect(linked?.bluesky_did).toBe(did)
    expect(linked?.handle).toBe(handle)
  })

  it('throws 404 when no session row exists for the DID yet', async () => {
    const user = await createTestUserDirect()
    const authorizationId = v7()
    await ensureTestBlueskyLinkAuthorization({ authorizationId, userId: user.id })

    await expect(
      connectBlueskyAccountToUser(user.id, fakeDid(), fakeHandle(), {
        linkAuthorizationId: authorizationId,
      }),
    ).rejects.toThrow(/complete the Bluesky sign-in step/)
  })

  it('is idempotent for the same user re-linking the same DID', async () => {
    const user = await createTestUserDirect()
    const did = fakeDid()
    const authorizationId = await seedLinkedAccountRow(did, user.id)

    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: authorizationId,
    })
    const attachedAt = await getTestBlueskyLinkAttachmentTime(authorizationId)
    expect(attachedAt).toBeTypeOf('string')
    const secondHandle = fakeHandle()
    await connectBlueskyAccountToUser(user.id, did, secondHandle, {
      linkAuthorizationId: authorizationId,
    })

    const linked = await getBlueskyLinkedAccountForUser(user.id)
    expect(linked?.handle).toBe(secondHandle)
    expect(await getTestBlueskyLinkAttachmentTime(authorizationId)).toBe(attachedAt)
  })

  it('rejects another user without admitting the original linking session', async () => {
    const owner = await createTestUserDirect()
    const other = await createTestUserDirect()
    const did = fakeDid()
    const authorizationId = await seedLinkedAccountRow(did, owner.id)
    await connectBlueskyAccountToUser(owner.id, did, fakeHandle(), {
      linkAuthorizationId: authorizationId,
    })

    await expect(
      connectBlueskyAccountToUser(other.id, did, fakeHandle(), {
        linkAuthorizationId: authorizationId,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED', status: 401 })
    expect((await getBlueskyLinkedAccountForUser(owner.id))?.bluesky_did).toBe(did)
  })

  it('throws 409 when the user already has a different Bluesky account linked', async () => {
    const user = await createTestUserDirect()
    const firstDid = fakeDid()
    const secondDid = fakeDid()
    const firstAuthorizationId = await seedLinkedAccountRow(firstDid, user.id)
    await connectBlueskyAccountToUser(user.id, firstDid, fakeHandle(), {
      linkAuthorizationId: firstAuthorizationId,
    })
    const secondAuthorizationId = await seedLinkedAccountRow(secondDid, user.id)

    await expect(
      connectBlueskyAccountToUser(user.id, secondDid, fakeHandle(), {
        linkAuthorizationId: secondAuthorizationId,
      }),
    ).rejects.toThrow(/already have a Bluesky account linked/)
  })
})

describe('getBlueskyLinkedAccountForUser', () => {
  it('returns null when the user has no linked account', async () => {
    const user = await createTestUserDirect()
    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
  })

  it.each([
    ['deleted', softDeleteUser],
    ['suspended', suspendTestUser],
  ] as const)('does not expose an attached account for a %s user', async (_state, deactivate) => {
    const user = await createTestUserDirect()
    await insertTestBlueskyLinkedAccount({ userId: user.id })
    await deactivate(user.id)

    expect(await getBlueskyLinkedAccountForUser(user.id)).toBeNull()
  })

  // bluesky_did uniquely identifies the AT Protocol account; handle is
  // mutable cached display data (see the bluesky_linked_accounts migration's column comment).
  // Resolution must stay keyed on the DID even after Bluesky's own handle for the account changes.
  it('still resolves the same bluesky_did after the linked handle changes', async () => {
    const user = await createTestUserDirect()
    const did = fakeDid()
    const authorizationId = await seedLinkedAccountRow(did, user.id)
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: authorizationId,
    })

    const beforeHandleChange = await getBlueskyLinkedAccountForUser(user.id)
    expect(beforeHandleChange?.bluesky_did).toBe(did)

    const changedHandle = fakeHandle()
    await connectBlueskyAccountToUser(user.id, did, changedHandle, {
      linkAuthorizationId: authorizationId,
    })

    const afterHandleChange = await getBlueskyLinkedAccountForUser(user.id)
    expect(afterHandleChange?.bluesky_did).toBe(did)
    expect(afterHandleChange?.handle).toBe(changedHandle)
  })
})
