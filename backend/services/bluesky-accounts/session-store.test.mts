import { describe, it, expect } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  ensureTestBlueskyLinkAuthorization,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import type { NodeSavedSession } from '@modules/bluesky-oauth'
import { BlueskySessionStore } from './session-store.mts'
import { connectBlueskyAccountToUser } from './connect.mts'
import { v7 } from 'uuid'
import {
  runWithAttachedBlueskySession,
  runWithBlueskySessionAuthorization,
} from './session-lifecycle-context.mts'
import { BlueskySessionLifecycleConflictError } from './session-generation.mts'
import { deleteUser } from '../users/delete.mts'
import { drainUserDeletionForTest } from '../users/delete-test-support.mts'

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

function fakeSession(overrides: Partial<NodeSavedSession> = {}): NodeSavedSession {
  return {
    dpopKey: { kty: 'EC', crv: 'P-256', x: 'x-coord', y: 'y-coord', d: 'private-d' },
    authMethod: 'none',
    tokenSet: {
      iss: 'https://bsky.social',
      sub: fakeDid(),
      aud: 'https://example.voucha.ai/client-metadata.json',
      access_token: `access-${createRandomString(16)}`,
      refresh_token: `refresh-${createRandomString(16)}`,
      token_type: 'DPoP',
      scope: 'atproto transition:generic',
    },
    ...overrides,
  } as unknown as NodeSavedSession
}

describe('BlueskySessionStore', () => {
  it('get returns undefined for a DID that was never stored', async () => {
    const store = new BlueskySessionStore()
    expect(await store.get(fakeDid())).toBeUndefined()
  })

  it('round-trips a session through set/get', async () => {
    const store = new BlueskySessionStore()
    const did = fakeDid()
    const session = fakeSession()
    const user = await createTestUserDirect()

    await setAuthorizedSession(store, user.id, did, session)

    expect(await store.get(did)).toEqual(session)
  })

  it('never persists the session as plaintext', async () => {
    const store = new BlueskySessionStore()
    const did = fakeDid()
    const session = fakeSession()
    const user = await createTestUserDirect()

    await setAuthorizedSession(store, user.id, did, session)

    const row = await getTestBlueskyLinkedAccountRow(did)
    expect(row).not.toBeNull()
    expect(row!.session_ciphertext).not.toContain(session.tokenSet.access_token)
    expect(row!.session_ciphertext).not.toContain(session.tokenSet.refresh_token)
  })

  it('a second set() (token refresh) never clobbers user_id/handle set by connect', async () => {
    const store = new BlueskySessionStore()
    const did = fakeDid()
    const user = await createTestUserDirect()
    const authorizationId = await setAuthorizedSession(store, user.id, did, fakeSession())
    const handle = `alice-${createRandomString(6)}.bsky.social`
    await connectBlueskyAccountToUser(user.id, did, handle, {
      linkAuthorizationId: authorizationId,
    })

    const refreshed = fakeSession()
    await setAttachedSession(store, user.id, did, authorizationId, refreshed)

    const row = await getTestBlueskyLinkedAccountRow(did)
    expect(row!.user_id).toBe(user.id)
    expect(row!.handle).toBe(handle)
    expect(await store.get(did)).toEqual(refreshed)
  })

  it('a token refresh preserves native flow ownership on an unattached session', async () => {
    const store = new BlueskySessionStore()
    const flowId = v7()
    const owner = await createTestUserDirect()
    const { bluesky_did: did } = await insertTestBlueskyLinkedAccount({
      userId: null,
      handle: null,
      nativeFlowId: flowId,
      linkingUserId: owner.id,
      authorizationId: flowId,
    })

    const refreshed = fakeSession()
    await setAuthorizedSession(store, owner.id, did, refreshed, flowId, 'native')

    expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({
      user_id: null,
      link_authorization_id: flowId,
    })
    expect(await store.get(did)).toEqual(refreshed)
  })

  it('del removes the row entirely', async () => {
    const store = new BlueskySessionStore()
    const did = fakeDid()
    const user = await createTestUserDirect()
    const authorizationId = await setAuthorizedSession(store, user.id, did, fakeSession())

    await deleteLinkingSession(store, user.id, did, authorizationId)

    expect(await store.get(did)).toBeUndefined()
    expect(await getTestBlueskyLinkedAccountRow(did)).toBeNull()
  })

  it('fails closed for context-free refresh and delete writes', async () => {
    const store = new BlueskySessionStore()
    const user = await createTestUserDirect()
    const did = fakeDid()
    const authorizationId = await setAuthorizedSession(store, user.id, did, fakeSession())
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: authorizationId,
    })

    await expect(store.set(did, fakeSession())).rejects.toThrow(
      BlueskySessionLifecycleConflictError,
    )
    await expect(store.del(did)).rejects.toThrow(BlueskySessionLifecycleConflictError)
    expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({ user_id: user.id })
  })

  it('a concurrent refresh cannot resurrect a session removed by unlink', async () => {
    const store = new BlueskySessionStore()
    const user = await createTestUserDirect()
    const did = fakeDid()
    const authorizationId = await setAuthorizedSession(store, user.id, did, fakeSession())
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: authorizationId,
    })

    const [refreshResult, unlinkResult] = await Promise.allSettled([
      setAttachedSession(store, user.id, did, authorizationId, fakeSession()),
      deleteAttachedSession(store, user.id, did, authorizationId),
    ])

    expect(unlinkResult.status).toBe('fulfilled')
    await expectRefreshCompletedOrLostLifecycleRace(refreshResult)
    expect(await getTestBlueskyLinkedAccountRow(did)).toBeNull()
  })

  it('a concurrent refresh cannot resurrect a session removed by user deletion', async () => {
    const store = new BlueskySessionStore()
    const user = await createTestUserDirect()
    const did = fakeDid()
    const authorizationId = await setAuthorizedSession(store, user.id, did, fakeSession())
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: authorizationId,
    })

    const [refreshResult, deletionResult] = await Promise.allSettled([
      setAttachedSession(store, user.id, did, authorizationId, fakeSession()),
      deleteUser(user, user),
    ])

    expect(deletionResult.status).toBe('fulfilled')
    if (deletionResult.status === 'fulfilled') {
      await drainUserDeletionForTest(deletionResult.value)
    }
    await expectRefreshCompletedOrLostLifecycleRace(refreshResult)
    expect(await getTestBlueskyLinkedAccountRow(did)).toBeNull()
  })

  it('blocks a pre-unlink authorization callback but permits a newer explicit authorization', async () => {
    const store = new BlueskySessionStore()
    const user = await createTestUserDirect()
    const did = fakeDid()
    const staleAuthorizationId = v7()
    await setAuthorizedSession(store, user.id, did, fakeSession(), staleAuthorizationId)
    await deleteLinkingSession(store, user.id, did, staleAuthorizationId)

    await expect(
      setAuthorizedSession(store, user.id, did, fakeSession(), staleAuthorizationId),
    ).rejects.toThrow(/lifecycle/)
    expect(await getTestBlueskyLinkedAccountRow(did)).toBeNull()

    await setAuthorizedSession(store, user.id, did, fakeSession(), v7())
    expect(await getTestBlueskyLinkedAccountRow(did)).not.toBeNull()
  })
})

function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

async function setAuthorizedSession(
  store: BlueskySessionStore,
  userId: string,
  did: string,
  session: NodeSavedSession,
  authorizationId = v7(),
  callbackMode: 'web' | 'native' = 'web',
): Promise<string> {
  await ensureTestBlueskyLinkAuthorization({ authorizationId, userId, callbackMode })
  await runWithBlueskySessionAuthorization(
    { authorizationId, owner: { kind: 'linking', userId }, callbackMode },
    async () => await store.set(did, session),
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

async function deleteLinkingSession(
  store: BlueskySessionStore,
  userId: string,
  did: string,
  authorizationId: string,
): Promise<void> {
  await runWithBlueskySessionAuthorization(
    { authorizationId, owner: { kind: 'linking', userId } },
    async () => await store.del(did),
  )
}

async function expectRefreshCompletedOrLostLifecycleRace(
  result: PromiseSettledResult<void>,
): Promise<void> {
  if (result.status === 'fulfilled') return
  expect(result.reason).toBeInstanceOf(BlueskySessionLifecycleConflictError)
}
