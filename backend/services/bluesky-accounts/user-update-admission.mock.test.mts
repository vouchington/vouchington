import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyCompletionProofVerifier,
  getTestBlueskyLinkedAccountRow,
  getTestBlueskyLinkAuthorizationRow,
  insertTestBlueskyLinkedAccount,
  requestTestBlueskyDisconnect,
  testBlueskyLinkCompletionExists,
} from '@voucha/test-helpers'
import { createNativeBlueskyLinkCompletion } from '@voucha/test-helpers/bluesky-native-completion-fixtures'
import {
  holdUserUpdatedAdmission,
  mockUserUpdatedJobAdd,
} from '../../test-helpers/bluesky-user-update-admission.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import type { NodeOAuthClient } from '@modules/bluesky-oauth'

const revokeBlueskySessionMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    revokeBlueskySession: revokeBlueskySessionMock,
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
  }),
)
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

import { disconnectAcceptedBlueskyGeneration } from './disconnect.mts'
import { connectBlueskyAccountToUser, getBlueskyLinkedAccountForUser } from './connect.mts'
import { finalizeNativeBlueskyAccountLink } from './native-completion.mts'
import { BlueskySessionStore } from './session-store.mts'
import { requestBlueskyDisconnect } from '../bluesky-follows/disconnect-request.mts'

vi.mocked(revokeBlueskySessionMock).mockImplementation(
  async (_client: NodeOAuthClient, did: string) => new BlueskySessionStore().del(did),
)

type UserUpdatedAdmissionGate = ReturnType<typeof holdUserUpdatedAdmission>

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

async function seedLinkedAccount(userId: string): Promise<string> {
  const did = fakeDid()
  await insertTestBlueskyLinkedAccount({ userId, did })
  return did
}

async function expectPendingUserUpdatedAdmission<Result>(
  userId: string,
  start: (gate: UserUpdatedAdmissionGate) => Promise<Result>,
  assertCommittedState: () => Promise<void>,
): Promise<Result> {
  const gate = holdUserUpdatedAdmission(userId)
  const reportsBeforeAdmission = sentryCaptureExceptionMock.mock.calls.length
  let operation: Promise<Result> | undefined
  let settled = false
  try {
    operation = start(gate).then(result => {
      settled = true
      return result
    })
    const reached = await Promise.race([
      gate.entered.then(() => 'admission' as const),
      operation.then(() => 'settled' as const),
    ])
    expect(reached).toBe('admission')
    await assertCommittedState()
    expect(settled).toBe(false)
    await gate.finishAdmission()
    if (operation === undefined) throw new Error('The user update operation did not start')
    const result = await operation
    expect(await gate.readAdmittedJob()).toMatchObject({
      name: gate.jobName,
      data: { id: userId },
    })
    expect(sentryCaptureExceptionMock.mock.calls.slice(reportsBeforeAdmission)).toHaveLength(0)
    return result
  } finally {
    await gate.cleanup(operation)
  }
}

describe('Bluesky user updates settle after their durable mutation', () => {
  it('waits for owned connect admission after the account transaction commits', async () => {
    const user = await createTestUserDirect()
    const did = fakeDid()
    const handle = `user-${createRandomString(6)}.bsky.social`
    const account = await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
    })

    await expectPendingUserUpdatedAdmission(
      user.id,
      () =>
        connectBlueskyAccountToUser(user.id, did, handle, {
          linkAuthorizationId: account.link_authorization_id,
        }),
      async () => {
        expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({
          user_id: user.id,
          handle,
          link_authorization_id: account.link_authorization_id,
        })
      },
    )
  })

  it('waits for native completion admission after attachment commits', async () => {
    const user = await createTestUserDirect()
    const flowId = randomUUID()
    const did = fakeDid()
    const account = await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
      authorizationId: flowId,
      nativeFlowId: flowId,
    })
    const token = await createNativeBlueskyLinkCompletion({
      flowId,
      userId: user.id,
      did,
      handle: `user-${createRandomString(6)}.bsky.social`,
    })

    await expectPendingUserUpdatedAdmission(
      user.id,
      () =>
        finalizeNativeBlueskyAccountLink(
          user.id,
          flowId,
          token,
          getTestBlueskyCompletionProofVerifier(flowId),
          () => new Date(),
        ),
      async () => {
        expect(await getTestBlueskyLinkedAccountRow(did)).toMatchObject({ user_id: user.id })
        expect(await testBlueskyLinkCompletionExists(account.link_authorization_id)).toBe(false)
      },
    )
  })

  it('waits for disconnect-request admission after recording the request', async () => {
    const user = await createTestUserDirect()
    const did = await seedLinkedAccount(user.id)

    const request = await expectPendingUserUpdatedAdmission(
      user.id,
      () => requestBlueskyDisconnect(user.id),
      async () => {
        expect(await getBlueskyLinkedAccountForUser(user.id, {}, true)).toMatchObject({
          bluesky_did: did,
          disconnect_requested_at: expect.any(Date),
        })
      },
    )

    expect(request).toMatchObject({ userId: user.id, blueskyDid: did })
  })

  it('waits for accepted-revoke admission after revoking the exact linked generation', async () => {
    const user = await createTestUserDirect()
    const did = await seedLinkedAccount(user.id)
    await requestTestBlueskyDisconnect(did)
    const linked = await getBlueskyLinkedAccountForUser(user.id, {}, true)
    if (!linked) throw new Error('Expected a pending Bluesky disconnect')

    await expectPendingUserUpdatedAdmission(
      user.id,
      () =>
        disconnectAcceptedBlueskyGeneration(user.id, {
          blueskyDid: did,
          linkAuthorizationId: linked.link_authorization_id,
        }),
      async () => {
        expect(await getTestBlueskyLinkedAccountRow(did)).toBeNull()
        expect(
          await getTestBlueskyLinkAuthorizationRow(linked.link_authorization_id),
        ).toMatchObject({ status: 'revoked', handle: null })
      },
    )
  })

  it.each(['synchronous throw', 'rejected admission'] as const)(
    'keeps disconnect success and reports one %s user-update admission failure',
    async failureMode => {
      const user = await createTestUserDirect()
      const did = await seedLinkedAccount(user.id)
      const failure = new Error('User update admission failed')
      const addSpy = mockUserUpdatedJobAdd(user.id, (_add, _name, _data, _options) => {
        if (failureMode === 'synchronous throw') throw failure
        return Promise.reject(failure)
      })
      try {
        await expect(requestBlueskyDisconnect(user.id)).resolves.toMatchObject({
          userId: user.id,
          blueskyDid: did,
        })
        expect(await getBlueskyLinkedAccountForUser(user.id, {}, true)).toMatchObject({
          bluesky_did: did,
          disconnect_requested_at: expect.any(Date),
        })
        const reports = sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure)
        expect(reports).toHaveLength(1)
      } finally {
        addSpy.mockRestore()
      }
    },
  )
})
