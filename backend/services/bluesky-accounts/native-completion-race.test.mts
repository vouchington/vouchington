import {
  createTestUserDirect,
  deleteTestBlueskyLinkCompletion,
  deleteTestBlueskyLinkedAccount,
  ensureTestBlueskyLinkAuthorization,
  expireTestBlueskyLinkAuthorization,
  getTestBlueskyLinkAuthorizationRow,
  getTestBlueskyLinkCompletionTokenHash,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
  setTestBlueskyLinkCompletionExpiresAt,
  setTestBlueskyLinkAuthorizationStatus,
  softDeleteUser,
  suspendTestUser,
  testBlueskyLinkCompletionExists,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { createNativeCompletionToken } from './native-completion-token.mts'
import { persistNativeBlueskyLinkCompletion } from './native-completion-persistence.mts'
import { resolveNativeBlueskyCallbackFailure } from './native-callback-failure.mts'

describe('native Bluesky callback timeout race', () => {
  it('fences a pending generation after an ambiguous provider failure', async () => {
    const user = await createTestUserDirect()
    const flowId = v7()
    const did = `did:plc:${v7().replaceAll('-', '')}`
    await ensureTestBlueskyLinkAuthorization({
      authorizationId: flowId,
      userId: user.id,
      callbackMode: 'native',
    })
    const { tokenHash } = createNativeCompletionToken(flowId)

    await expect(resolveNativeBlueskyCallbackFailure(flowId, tokenHash)).resolves.toBe('rejected')
    await expect(
      persistNativeBlueskyLinkCompletion({
        flowId,
        userId: user.id,
        did,
        handle: 'pending.bsky.social',
        tokenHash,
      }),
    ).rejects.toMatchObject({ status: 409 })

    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
    expect(await getTestBlueskyLinkAuthorizationRow(flowId)).toMatchObject({ status: 'rejected' })
  })

  it('returns the handoff when persistence wins the authorization lock race', async () => {
    const fixture = await createClaimedNativeFixture()
    const gate = createLockGate()
    const persistence = persistNativeBlueskyLinkCompletion(fixture, {
      afterAuthorizationLock: gate.hold,
    })
    await gate.entered
    const resolution = resolveNativeBlueskyCallbackFailure(fixture.flowId, fixture.tokenHash)

    gate.release()

    await expect(persistence).resolves.toBeUndefined()
    await expect(resolution).resolves.toBe('completed')
    expect(await testBlueskyLinkCompletionExists(fixture.flowId)).toBe(true)
  })

  it('persists the API-held handoff when timeout resolution wins the authorization lock race', async () => {
    const fixture = await createClaimedNativeFixture()
    const gate = createLockGate()
    const resolution = resolveNativeBlueskyCallbackFailure(fixture.flowId, fixture.tokenHash, {
      afterAuthorizationLock: gate.hold,
    })
    await gate.entered
    const persistence = persistNativeBlueskyLinkCompletion(fixture)

    gate.release()

    await expect(resolution).resolves.toBe('completed')
    await expect(persistence).resolves.toBeUndefined()
    expect(await testBlueskyLinkCompletionExists(fixture.flowId)).toBe(true)
    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).not.toBeNull()
  })

  it('preserves the winning handoff when a different-token ordinary persistence loses', async () => {
    const fixture = await createClaimedNativeFixture()
    await persistNativeBlueskyLinkCompletion(fixture)
    const { tokenHash: losingTokenHash } = createNativeCompletionToken(fixture.flowId)

    await expect(
      persistNativeBlueskyLinkCompletion({ ...fixture, tokenHash: losingTokenHash }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      resolveNativeBlueskyCallbackFailure(fixture.flowId, losingTokenHash),
    ).resolves.toBe('nonmatching')

    expect(await getTestBlueskyLinkCompletionTokenHash(fixture.flowId)).toBe(fixture.tokenHash)
    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).not.toBeNull()
  })

  it('preserves the winning handoff when a different-token timeout resolves later', async () => {
    const fixture = await createClaimedNativeFixture()
    await persistNativeBlueskyLinkCompletion(fixture)
    const { tokenHash: losingTokenHash } = createNativeCompletionToken(fixture.flowId)

    await expect(
      resolveNativeBlueskyCallbackFailure(fixture.flowId, losingTokenHash),
    ).resolves.toBe('nonmatching')

    expect(await getTestBlueskyLinkCompletionTokenHash(fixture.flowId)).toBe(fixture.tokenHash)
    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).not.toBeNull()
  })

  it('terminalizes a completion outside the atomic handoff-ready state', async () => {
    const fixture = await createClaimedNativeFixture()
    await persistNativeBlueskyLinkCompletion(fixture)
    await setTestBlueskyLinkAuthorizationStatus(fixture.flowId, 'callback_claimed')
    const { tokenHash: differentHash } = createNativeCompletionToken(fixture.flowId)

    await expect(resolveNativeBlueskyCallbackFailure(fixture.flowId, differentHash)).resolves.toBe(
      'rejected',
    )
    expect(await testBlueskyLinkCompletionExists(fixture.flowId)).toBe(false)
    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).toBeNull()
    expect(await getTestBlueskyLinkAuthorizationRow(fixture.flowId)).toMatchObject({
      status: 'rejected',
      handle: null,
    })
  })

  it('terminalizes an invalid handoff-ready generation during ordinary persistence', async () => {
    const fixture = await createClaimedNativeFixture()
    await persistNativeBlueskyLinkCompletion(fixture)
    await setTestBlueskyLinkCompletionExpiresAt(fixture.flowId, new Date(Date.now() - 1_000))

    await expect(persistNativeBlueskyLinkCompletion(fixture)).rejects.toMatchObject({ status: 409 })

    expect(await testBlueskyLinkCompletionExists(fixture.flowId)).toBe(false)
    expect(await getTestBlueskyLinkedAccountRow(fixture.did)).toBeNull()
    expect(await getTestBlueskyLinkAuthorizationRow(fixture.flowId)).toMatchObject({
      status: 'rejected',
      handle: null,
    })
  })

  it.each([
    [
      'an expired completion',
      async (flowId: string, _did: string) =>
        await setTestBlueskyLinkCompletionExpiresAt(flowId, new Date(Date.now() - 1_000)),
    ],
    [
      'a missing completion',
      async (flowId: string, _did: string) => await deleteTestBlueskyLinkCompletion(flowId),
    ],
    [
      'an expired authorization',
      async (flowId: string, _did: string) => await expireTestBlueskyLinkAuthorization(flowId),
    ],
    [
      'a missing provider account',
      async (_flowId: string, did: string) => await deleteTestBlueskyLinkedAccount(did),
    ],
  ] as const)(
    'rejects and cleans up a handoff-ready generation with %s',
    async (_state, corruptCompletion) => {
      const fixture = await createClaimedNativeFixture()
      await persistNativeBlueskyLinkCompletion(fixture)
      await corruptCompletion(fixture.flowId, fixture.did)

      await expect(
        resolveNativeBlueskyCallbackFailure(fixture.flowId, fixture.tokenHash),
      ).resolves.toBe('rejected')

      expect(await testBlueskyLinkCompletionExists(fixture.flowId)).toBe(false)
      expect(await getTestBlueskyLinkedAccountRow(fixture.did)).toBeNull()
      expect(await getTestBlueskyLinkAuthorizationRow(fixture.flowId)).toMatchObject({
        status: 'rejected',
        handle: null,
      })
    },
  )

  it.each([
    ['suspended', suspendTestUser],
    ['deleted', softDeleteUser],
  ] as const)(
    'preserves an already-ready winner on matching and different-hash %s-user redelivery',
    async (_state, mutateUser) => {
      const fixture = await createClaimedNativeFixture()
      await persistNativeBlueskyLinkCompletion(fixture)
      await mutateUser(fixture.userId)

      await expect(persistNativeBlueskyLinkCompletion(fixture)).resolves.toBeUndefined()
      const { tokenHash: differentHash } = createNativeCompletionToken(fixture.flowId)
      await expect(
        persistNativeBlueskyLinkCompletion({ ...fixture, tokenHash: differentHash }),
      ).rejects.toMatchObject({ status: 409 })

      expect(await getTestBlueskyLinkCompletionTokenHash(fixture.flowId)).toBe(fixture.tokenHash)
      expect(await getTestBlueskyLinkedAccountRow(fixture.did)).not.toBeNull()
      expect(await getTestBlueskyLinkAuthorizationRow(fixture.flowId)).toMatchObject({
        status: 'handoff_ready',
      })
    },
  )

  it.each([
    ['suspended', suspendTestUser],
    ['deleted', softDeleteUser],
  ] as const)(
    'deletes and terminalizes a callback-claimed generation for a %s user',
    async (_state, mutateUser) => {
      const fixture = await createClaimedNativeFixture()
      await mutateUser(fixture.userId)

      await expect(persistNativeBlueskyLinkCompletion(fixture)).rejects.toMatchObject({
        status: expect.any(Number),
      })

      expect(await testBlueskyLinkCompletionExists(fixture.flowId)).toBe(false)
      expect(await getTestBlueskyLinkedAccountRow(fixture.did)).toBeNull()
      expect(await getTestBlueskyLinkAuthorizationRow(fixture.flowId)).toMatchObject({
        status: 'rejected',
        handle: null,
      })
    },
  )
})

async function createClaimedNativeFixture() {
  const user = await createTestUserDirect()
  const flowId = v7()
  const account = await insertTestBlueskyLinkedAccount({
    userId: null,
    linkingUserId: user.id,
    authorizationId: flowId,
    nativeFlowId: flowId,
  })
  const { tokenHash } = createNativeCompletionToken(flowId)
  return {
    flowId,
    userId: user.id,
    did: account.bluesky_did,
    handle: account.handle!,
    tokenHash,
  }
}

function createLockGate(): {
  hold: () => Promise<void>
  entered: Promise<void>
  release: () => void
} {
  let release!: () => void
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  let signalEntered!: () => void
  const entered = new Promise<void>(resolve => {
    signalEntered = resolve
  })
  const hold = async () => {
    signalEntered()
    await released
  }
  return { hold, entered, release }
}
