import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestPasskeyAuthenticator,
  getTestPasskeyCounter,
} from '@voucha/test-helpers/entities/passkey-authentication'
import { RP_ID } from '@services/passkeys/config'
import { beginPasskeyReAuth, completePasskeyReAuth } from './passkey-reauth.mts'
import {
  createTestAccountChangeActor,
  consumeTestAccountChangeProof,
} from '@voucha/test-helpers/account-change'

const origin = `https://${RP_ID}`

describe('fresh passkey account-change proof', () => {
  it('accepts a possession-only assertion, binds session, and consumes the proof once', async () => {
    const user = await createTestUser()
    const authenticator = await createTestPasskeyAuthenticator(user.id, RP_ID, origin)
    const actor = await createTestAccountChangeActor(user.id)
    const session = {
      deviceId: actor.session.did,
      sessionId: actor.session.sid,
      passkeyId: authenticator.passkeyId,
    }
    const { flow_id, options } = await beginPasskeyReAuth(user.id, session)
    expect(options.userVerification).toBe('preferred')
    const response = authenticator.createAssertion(options.challenge, { userHandle: null })
    await expect(
      completePasskeyReAuth(user.id, {
        ...session,
        sessionId: randomUUID(),
        flowId: flow_id,
        expectedOrigin: origin,
        response,
      }),
    ).rejects.toMatchObject({ status: 401 })
    const token = await completePasskeyReAuth(user.id, {
      ...session,
      flowId: flow_id,
      expectedOrigin: origin,
      response,
    })
    expect(await getTestPasskeyCounter(authenticator.passkeyId)).toBe(1)
    await expect(consumeTestAccountChangeProof(user.id, actor.session, token)).resolves.toBe(true)
    await expect(consumeTestAccountChangeProof(user.id, actor.session, token)).resolves.toBe(false)
    await expect(
      completePasskeyReAuth(user.id, {
        ...session,
        flowId: flow_id,
        expectedOrigin: origin,
        response,
      }),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('rejects selecting a credential owned by another account before offering options', async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    const authenticator = await createTestPasskeyAuthenticator(other.id, RP_ID, origin)
    const actor = await createTestAccountChangeActor(user.id)
    await expect(
      beginPasskeyReAuth(user.id, {
        deviceId: actor.session.did,
        sessionId: actor.session.sid,
        passkeyId: authenticator.passkeyId,
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it.each(['origin', 'userHandle', 'credential', 'selectedCredential'] as const)(
    'rejects a wrong %s and leaves the owned counter unchanged',
    async mismatch => {
      const user = await createTestUser()
      const authenticator = await createTestPasskeyAuthenticator(user.id, RP_ID, origin)
      const actor = await createTestAccountChangeActor(user.id)
      const session = {
        deviceId: actor.session.did,
        sessionId: actor.session.sid,
        passkeyId: authenticator.passkeyId,
      }
      const signer =
        mismatch === 'credential'
          ? await createTestPasskeyAuthenticator((await createTestUser()).id, RP_ID, origin)
          : mismatch === 'selectedCredential'
            ? await createTestPasskeyAuthenticator(user.id, RP_ID, origin)
            : authenticator
      const { flow_id, options } = await beginPasskeyReAuth(user.id, session)
      expect(options.allowCredentials?.map(credential => credential.id)).toEqual([
        authenticator.credentialId,
      ])
      const response = signer.createAssertion(options.challenge, {
        ...(mismatch === 'origin' && { origin: 'https://example.com' }),
        ...(mismatch === 'userHandle' && {
          userHandle: Buffer.from(randomUUID()).toString('base64url'),
        }),
      })
      await expect(
        completePasskeyReAuth(user.id, {
          ...session,
          flowId: flow_id,
          expectedOrigin: origin,
          response,
        }),
      ).rejects.toMatchObject({ status: 401 })
      expect(await getTestPasskeyCounter(authenticator.passkeyId)).toBe(0)
      await expect(
        completePasskeyReAuth(user.id, {
          ...session,
          flowId: flow_id,
          expectedOrigin: origin,
          response: authenticator.createAssertion(options.challenge),
        }),
      ).rejects.toMatchObject({ status: 401 })
    },
  )
})
