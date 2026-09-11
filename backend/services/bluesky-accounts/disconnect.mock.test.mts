import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyLinkAuthorizationRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import type { NodeOAuthClient } from '@modules/bluesky-oauth'

const revokeBlueskySessionMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
// createBlueskyOAuthClient constructs a real @atproto/oauth-client-node NodeOAuthClient, which
// validates its client-metadata shape (client_id/redirect_uris) against the resolved site origin
// at construction time. That validation requires a real https origin (see client-metadata.mts) —
// local/CI worktrees resolve to a localhost origin, which the SDK correctly rejects. This is the
// @modules/bluesky-oauth SDK boundary (see backend/CLAUDE.md § Provider-wide SDK boundaries), so
// it's mocked here rather than exercised for real; the OAuth I/O it would perform is separately
// mocked below via revokeBlueskySession.
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    revokeBlueskySession: revokeBlueskySessionMock,
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
  }),
)
// getBlueskyOAuthClient() memoizes its result for the lifetime of the module, so this mock is
// invoked at most once across the whole file — configure a stable fake up front rather than in
// each test's beforeEach.
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

import { disconnectBlueskyAccountFromUser } from './disconnect.mts'
import { getBlueskyLinkedAccountForUser } from './connect.mts'
import { getBlueskyOAuthClient } from './client.mts'
import { BlueskySessionStore } from './session-store.mts'

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

async function seedLinkedAccount(userId: string): Promise<string> {
  const did = fakeDid()
  await insertTestBlueskyLinkedAccount({ userId, did })
  return did
}

describe('disconnectBlueskyAccountFromUser', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    revokeBlueskySessionMock.mockImplementation(
      async (_client: NodeOAuthClient, did: string) => await new BlueskySessionStore().del(did),
    )
  })

  it('throws 404 when the user has no Bluesky account linked', async () => {
    const user = await createTestUserDirect()

    await expect(disconnectBlueskyAccountFromUser(user.id)).rejects.toThrow(
      /No Bluesky account linked/,
    )
    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
  })

  it('revokes the session for the calling user own DID', async () => {
    const user = await createTestUserDirect()
    const did = await seedLinkedAccount(user.id)

    const linked = await getBlueskyLinkedAccountForUser(user.id)
    await disconnectBlueskyAccountFromUser(user.id)

    expect(revokeBlueskySessionMock).toHaveBeenCalledTimes(1)
    expect(revokeBlueskySessionMock).toHaveBeenCalledWith(await getBlueskyOAuthClient(), did)
    expect(await getTestBlueskyLinkAuthorizationRow(linked!.link_authorization_id)).toMatchObject({
      status: 'revoked',
      handle: null,
    })
  })

  it('never revokes another user session, even if the caller knows their DID', async () => {
    const owner = await createTestUserDirect()
    const attacker = await createTestUserDirect()
    await seedLinkedAccount(owner.id)

    await expect(disconnectBlueskyAccountFromUser(attacker.id)).rejects.toThrow(
      /No Bluesky account linked/,
    )
    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    // The owner's link must still be intact — disconnect never touched it.
    expect(await getBlueskyLinkedAccountForUser(owner.id)).not.toBeNull()
  })

  it('ignores a stale expected generation while preserving the current link', async () => {
    const user = await createTestUserDirect()
    const did = await seedLinkedAccount(user.id)

    await disconnectBlueskyAccountFromUser(user.id, {
      blueskyDid: fakeDid(),
      linkAuthorizationId: crypto.randomUUID(),
    })

    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    expect(await getBlueskyLinkedAccountForUser(user.id)).toMatchObject({ bluesky_did: did })
  })
})
