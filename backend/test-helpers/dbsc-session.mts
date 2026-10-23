import { v7 } from 'uuid'
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import { createTestUserDirect, getTestPrivateUserById } from './entities/users.mts'
import {
  createDeviceAndSessionTokens,
  refreshSessionState,
} from '../services/jwt-session/index.mts'
import { authorizeDbscProof } from '../services/jwt-session/dbsc-proof.mts'
import {
  createDbscRegistrationOffer,
  createDbscRefreshChallenge,
} from '../services/jwt-session/dbsc-registration.mts'

export const DBSC_TEST_ORIGIN = 'https://dbsc.example'
export const DBSC_TEST_USER_AGENT = 'Synthetic browser/1.0'
export const DBSC_TEST_REGISTRATION_URL = `${DBSC_TEST_ORIGIN}/api/v1/auth/device-bound-sessions`
export const DBSC_TEST_REFRESH_URL = `${DBSC_TEST_REGISTRATION_URL}/refreshes`

/** Real issued authority and a disposable P-256 browser key; proofs match Chromium's wire shape. */
export async function createDbscTestSession() {
  const user = await createTestUserDirect()
  const tokens = await createDeviceAndSessionTokens({
    did: v7(),
    uid: user.id,
    deviceContext: { user_agent: DBSC_TEST_USER_AGENT },
  })
  const key = await generateKeyPair('ES256', { extractable: true })
  const publicKey = await exportJWK(key.publicKey)
  const base = {
    deviceToken: tokens.deviceToken.token,
    userAgent: DBSC_TEST_USER_AGENT,
    origin: DBSC_TEST_ORIGIN,
    fetchUser: getTestPrivateUserById,
  }
  const nonce = await createDbscRegistrationOffer(base)
  if (!nonce) throw new Error('DBSC fixture did not receive its credential-completion challenge')
  async function sign(challenge: string, registration = false, headerJwk?: JWK) {
    return new SignJWT({ jti: challenge })
      .setProtectedHeader({
        alg: 'ES256',
        typ: 'dbsc+jwt',
        ...((registration || headerJwk) && { jwk: headerJwk ?? publicKey }),
      })
      .sign(key.privateKey)
  }
  async function authorizeRegistration(proofHeader?: string) {
    return authorizeDbscProof({
      ...base,
      purpose: 'registration',
      requestUrl: DBSC_TEST_REGISTRATION_URL,
      proofHeader: proofHeader ?? (await sign(nonce!, true)),
    })
  }
  async function register() {
    const proof = await authorizeRegistration()
    const state = await refreshSessionState({
      ...base,
      dbscProof: proof,
    })
    return state
  }
  async function challenge(deviceToken: string) {
    const value = await createDbscRefreshChallenge({
      ...base,
      deviceToken,
      sessionId: tokens.sessionToken.payload.sid,
    })
    if (!value) throw new Error('DBSC fixture did not receive a refresh challenge')
    return value
  }
  async function authorizeRefresh(
    deviceToken: string,
    challengeValue: string,
    proofHeader?: string,
  ) {
    return authorizeDbscProof({
      ...base,
      deviceToken,
      purpose: 'refresh',
      requestUrl: DBSC_TEST_REFRESH_URL,
      sessionHeader: tokens.sessionToken.payload.sid,
      proofHeader: proofHeader ?? (await sign(challengeValue)),
    })
  }
  return {
    user,
    tokens,
    key,
    publicKey,
    base,
    nonce,
    sign,
    authorizeRegistration,
    register,
    challenge,
    authorizeRefresh,
  }
}
