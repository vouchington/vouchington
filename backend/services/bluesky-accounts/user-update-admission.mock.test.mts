import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { background } from '@queues/background/queues'
import { ENTITY_LISTENERS_USER_UPDATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
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
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import { withEntityListenerAdmissionRead } from '@voucha/test-helpers/entity-listener-admission-read'
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
  start: () => Promise<Result>,
  assertCommittedState: () => Promise<void>,
): Promise<Result> {
  let operationSettled = false
  const reportsBeforeAdmission = sentryCaptureExceptionMock.mock.calls.length
  const result = await withEntityListenerAdmissionRead(
    { jobName: 'processUserUpdated', entityId: userId },
    async () => {
      try {
        return await start()
      } finally {
        operationSettled = true
      }
    },
    async () => {
      expect(operationSettled).toBe(false)
      await assertCommittedState()
      expect(operationSettled).toBe(false)
    },
  )
  expect(sentryCaptureExceptionMock.mock.calls.slice(reportsBeforeAdmission)).toHaveLength(0)
  return result
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
    const actor = await createTestAccountChangeActor(user.id)
    const flowId = randomUUID()
    const did = fakeDid()
    const account = await insertTestBlueskyLinkedAccount({
      userId: null,
      did,
      linkingUserId: user.id,
      authorizationId: flowId,
      nativeFlowId: flowId,
      initiatingSessionId: actor.session.sid,
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
          actor.session,
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
      const originalAdd = background.add
      let ownedAttempts = 0
      const addSpy = vi.spyOn(background, 'add').mockImplementation((name, data, options) => {
        const matches =
          name === ENTITY_LISTENERS_USER_UPDATED_JOB.name &&
          typeof data === 'object' &&
          data !== null &&
          'id' in data &&
          data.id === user.id
        if (!matches) return originalAdd.call(background, name, data, options)
        ownedAttempts += 1
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
        expect(ownedAttempts).toBe(1)
        const reports = sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure)
        expect(reports).toHaveLength(1)
      } finally {
        addSpy.mockRestore()
      }
    },
  )
})
