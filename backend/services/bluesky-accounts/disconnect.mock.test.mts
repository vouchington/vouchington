import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRandomString,
  getTestBlueskyLinkedAccountRow,
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
// @modules/bluesky-oauth SDK boundary (see backend/AGENTS.md § Provider-wide SDK boundaries), so
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

import { disconnectAcceptedBlueskyGeneration } from './disconnect.mts'
import { getBlueskyLinkedAccountForUser } from './connect.mts'
import { getBlueskyOAuthClient } from './client.mts'
import { BlueskySessionStore } from './session-store.mts'
import { requestBlueskyDisconnect } from '../bluesky-follows/disconnect-request.mts'

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

async function seedLinkedAccount(userId: string): Promise<string> {
  const did = fakeDid()
  await insertTestBlueskyLinkedAccount({ userId, did })
  return did
}

describe('disconnectAcceptedBlueskyGeneration', () => {
  beforeEach(() => {
    revokeBlueskySessionMock.mockReset()
    revokeBlueskySessionMock.mockImplementation(async (_client: NodeOAuthClient, did: string) =>
      new BlueskySessionStore().del(did),
    )
  })

  it('ignores an accepted generation when the user has no linked account', async () => {
    const user = await createTestUserDirect()

    await expect(
      disconnectAcceptedBlueskyGeneration(user.id, {
        blueskyDid: fakeDid(),
        linkAuthorizationId: crypto.randomUUID(),
      }),
    ).resolves.toBeUndefined()
    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
  })

  it('ignores a linked generation without an accepted disconnect request', async () => {
    const user = await createTestUserDirect()
    const did = await seedLinkedAccount(user.id)
    const linked = await getBlueskyLinkedAccountForUser(user.id)
    if (!linked) throw new Error('Expected a linked Bluesky account')

    await disconnectAcceptedBlueskyGeneration(user.id, {
      blueskyDid: did,
      linkAuthorizationId: linked.link_authorization_id,
    })

    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({
      user_id: user.id,
      link_authorization_id: linked.link_authorization_id,
    })
  })

  it('revokes the session for the calling user own DID', async () => {
    const user = await createTestUserDirect()
    const did = await seedLinkedAccount(user.id)

    const request = await requestBlueskyDisconnect(user.id)
    await disconnectAcceptedBlueskyGeneration(user.id, {
      blueskyDid: request.blueskyDid,
      linkAuthorizationId: request.linkAuthorizationId,
    })

    expect(revokeBlueskySessionMock).toHaveBeenCalledTimes(1)
    expect(revokeBlueskySessionMock).toHaveBeenCalledWith(await getBlueskyOAuthClient(), did)
    expect(await getTestBlueskyLinkAuthorizationRow(request.linkAuthorizationId)).toMatchObject({
      status: 'revoked',
      handle: null,
    })
  })

  it('never revokes another user session, even if the caller knows their DID', async () => {
    const owner = await createTestUserDirect()
    const attacker = await createTestUserDirect()
    const did = await seedLinkedAccount(owner.id)
    const request = await requestBlueskyDisconnect(owner.id)
    await disconnectAcceptedBlueskyGeneration(attacker.id, {
      blueskyDid: request.blueskyDid,
      linkAuthorizationId: request.linkAuthorizationId,
    })
    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    // The owner's link must still be intact — disconnect never touched it.
    expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({
      user_id: owner.id,
      link_authorization_id: request.linkAuthorizationId,
    })
  })

  it('ignores a stale expected generation while preserving the current link', async () => {
    const user = await createTestUserDirect()
    const did = await seedLinkedAccount(user.id)

    const request = await requestBlueskyDisconnect(user.id)
    await disconnectAcceptedBlueskyGeneration(user.id, {
      blueskyDid: request.blueskyDid,
      linkAuthorizationId: crypto.randomUUID(),
    })

    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({
      user_id: user.id,
      link_authorization_id: request.linkAuthorizationId,
    })
  })
})
