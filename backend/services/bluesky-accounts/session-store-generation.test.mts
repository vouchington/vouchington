import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  ensureTestBlueskyLinkAuthorization,
  getTestBlueskyLinkedAccountRow,
} from '@voucha/test-helpers'
import type { NodeSavedSession } from '@modules/bluesky-oauth'
import { v7 } from 'uuid'
import { connectBlueskyAccountToUser } from './connect.mts'
import { BlueskySessionStore } from './session-store.mts'
import { BlueskySessionLifecycleConflictError } from './session-generation.mts'
import {
  runWithAttachedBlueskySession,
  runWithBlueskySessionAuthorization,
} from './session-lifecycle-context.mts'

describe('BlueskySessionStore generations', () => {
  it('a stale refresh cannot overwrite a newer same-DID relink generation', async () => {
    const setup = await createCrossUserRelink()
    const currentSession = await setup.store.get(setup.did)

    await expect(
      setAttachedSession(
        setup.store,
        setup.formerOwnerId,
        setup.did,
        setup.staleAuthorizationId,
        fakeSession(),
      ),
    ).rejects.toThrow(BlueskySessionLifecycleConflictError)
    expect(await setup.store.get(setup.did)).toEqual(currentSession)
  })

  it('a stale revoke cannot delete a newer cross-user same-DID relink', async () => {
    const setup = await createCrossUserRelink()

    await expect(
      deleteAttachedSession(
        setup.store,
        setup.formerOwnerId,
        setup.did,
        setup.staleAuthorizationId,
      ),
    ).rejects.toThrow(BlueskySessionLifecycleConflictError)
    expect(await getTestBlueskyLinkedAccountRow(setup.did)).toMatchObject({
      user_id: setup.currentOwnerId,
      link_authorization_id: setup.currentAuthorizationId,
    })
  })
})

async function createCrossUserRelink(): Promise<{
  store: BlueskySessionStore
  did: string
  formerOwnerId: string
  currentOwnerId: string
  staleAuthorizationId: string
  currentAuthorizationId: string
}> {
  const store = new BlueskySessionStore()
  const formerOwner = await createTestUserDirect()
  const currentOwner = await createTestUserDirect()
  const did = `did:plc:${createRandomString(24)}`
  const staleAuthorizationId = await setAuthorizedSession(store, formerOwner.id, did)
  await connectBlueskyAccountToUser(formerOwner.id, did, fakeHandle(), {
    linkAuthorizationId: staleAuthorizationId,
  })
  await deleteAttachedSession(store, formerOwner.id, did, staleAuthorizationId)
  const currentAuthorizationId = await setAuthorizedSession(store, currentOwner.id, did)
  await connectBlueskyAccountToUser(currentOwner.id, did, fakeHandle(), {
    linkAuthorizationId: currentAuthorizationId,
  })
  return {
    store,
    did,
    formerOwnerId: formerOwner.id,
    currentOwnerId: currentOwner.id,
    staleAuthorizationId,
    currentAuthorizationId,
  }
}

async function setAuthorizedSession(
  store: BlueskySessionStore,
  userId: string,
  did: string,
): Promise<string> {
  const authorizationId = v7()
  await ensureTestBlueskyLinkAuthorization({ authorizationId, userId })
  await runWithBlueskySessionAuthorization(
    { authorizationId, owner: { kind: 'linking', userId }, callbackMode: 'web' },
    async () => await store.set(did, fakeSession()),
  )
  return authorizationId
}

async function setAttachedSession(
  store: BlueskySessionStore,
  userId: string,
  did: string,
  authorizationId: string,
  session: NodeSavedSession,
): Promise<void> {
  await runWithAttachedBlueskySession(userId, authorizationId, async () => {
    await store.set(did, session)
  })
}

async function deleteAttachedSession(
  store: BlueskySessionStore,
  userId: string,
  did: string,
  authorizationId: string,
): Promise<void> {
  await runWithAttachedBlueskySession(userId, authorizationId, async () => {
    await store.del(did)
  })
}

function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

function fakeSession(): NodeSavedSession {
  return {
    dpopKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
    authMethod: 'none',
    tokenSet: {
      iss: 'https://bsky.social',
      sub: `did:plc:${createRandomString(24)}`,
      aud: 'https://example.voucha.ai/client-metadata.json',
      access_token: `access-${createRandomString(16)}`,
      refresh_token: `refresh-${createRandomString(16)}`,
      token_type: 'DPoP',
      scope: 'atproto transition:generic',
    },
  } as unknown as NodeSavedSession
}
