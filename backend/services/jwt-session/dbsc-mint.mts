import { getJwtRevokedKey, getJwtUserRevokedBeforeKey } from './constants.mts'
import { hashSessionUserAgent } from './client-binding.mts'
import type { SessionClientBinding } from './types.mts'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import { DEVICE_EXPIRATION_SECONDS } from '@ts-shared/session-jwt'
import { randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isSessionRevoked } from './revocation.mts'
import {
  getWebSessionAuthorityKey,
  getDbscChallengeKey,
  CHALLENGE_SECONDS,
  RETENTION_MARGIN_SECONDS,
} from './dbsc-state.mts'
import {
  parseSessionMintAuthority,
  type SessionMintAuthority,
  type NativeSessionAuthority,
  type DbscChallenge,
} from './dbsc-state-schema.mts'
import { sessionAuthorityRequired } from './dbsc-errors.mts'

const initializeScript = registerScript(
  loadScript('initialize-web-session-authority.lua', import.meta.url),
)

export async function prepareSessionAuthorityForMint(options: {
  uid: string
  did: string
  sid: string
  binding: SessionClientBinding
  userAgent?: string
  issuedAt: number
  origin?: string
  credentialReplay?: boolean
  deviceRenewal?: 'verified-native-attestation'
}): Promise<{ authority: SessionMintAuthority; isNew: boolean; binding: SessionClientBinding }> {
  const key = getWebSessionAuthorityKey(options.sid)
  const registrationNonce = randomBytes(32).toString('base64url')
  const identity = {
    uid: options.uid,
    did: options.did,
    sid: options.sid,
    deviceIssuedAt: options.issuedAt,
    deviceExpiresAt: options.issuedAt + DEVICE_EXPIRATION_SECONDS,
  }
  const candidate: SessionMintAuthority =
    options.binding.client === 'web'
      ? {
          ...identity,
          client: 'web',
          uaHash: options.binding.ua_hash,
          ...(options.origin && { origin: options.origin }),
          kind: 'unbound',
          registrationNonce,
          registrationExpiresAt: Math.floor(Date.now() / 1000) + CHALLENGE_SECONDS,
        }
      : { ...identity, client: 'native' }
  let existing = await sessionValkeyClient.get(key)
  if (existing === null && options.deviceRenewal) throw sessionAuthorityRequired()
  // A durable OAuth completion can commit before its first credential mint. The primary
  // registry is the mint receipt: retain every SID row, including revoked/expired rows,
  // until user deletion. Never infer first mint from a replica or an active-row filter.
  if (
    existing === null &&
    (!options.credentialReplay || !(await hasSessionMintReceipt(options.sid)))
  ) {
    const challenge: DbscChallenge = {
      purpose: 'registration',
      uid: options.uid,
      did: options.did,
      sid: options.sid,
      origin: options.origin ?? '',
    }
    const result = await sessionValkeyClient.invokeScript(initializeScript, {
      keys: [
        key,
        getDbscChallengeKey(registrationNonce),
        getJwtRevokedKey(options.sid),
        getJwtUserRevokedBeforeKey(options.uid),
      ],
      args: [
        JSON.stringify(candidate),
        JSON.stringify(challenge),
        String(
          Math.max(1, candidate.deviceExpiresAt - Math.floor(Date.now() / 1000)) +
            RETENTION_MARGIN_SECONDS,
        ),
        String(CHALLENGE_SECONDS),
        candidate.client === 'web' ? '1' : '0',
        String(candidate.deviceIssuedAt),
      ],
    })
    if (Number(result) === -1) throw sessionAuthorityRequired()
    if (Number(result) === 1)
      return { authority: candidate, isNew: true, binding: sessionBindingForAuthority(candidate) }
    existing = await sessionValkeyClient.get(key)
  }
  if (existing === null) throw sessionAuthorityRequired()
  let authority = parseSessionMintAuthority(String(existing))
  if (
    authority.uid !== options.uid ||
    authority.did !== options.did ||
    authority.sid !== options.sid ||
    (authority.client === 'web' &&
      (authority.uaHash !== hashSessionUserAgent(options.userAgent ?? '') ||
        authority.origin !== options.origin)) ||
    authority.deviceExpiresAt <= Math.floor(Date.now() / 1000) ||
    (await isSessionRevoked(options.sid, {
      userId: options.uid,
      issuedAt: authority.deviceIssuedAt,
    }))
  )
    throw sessionAuthorityRequired()
  if (options.deviceRenewal) {
    if (options.credentialReplay || authority.client !== 'native') throw sessionAuthorityRequired()
    authority = await renewNativeAuthority(authority, String(existing), options.issuedAt)
  }
  return { authority, isNew: false, binding: sessionBindingForAuthority(authority) }
}

function sessionBindingForAuthority(authority: SessionMintAuthority): SessionClientBinding {
  return authority.client === 'web'
    ? {
        client: 'web',
        ua_hash: authority.uaHash,
        ...(authority.kind === 'bound' && { dbsc: true }),
      }
    : { client: 'native' }
}

const renewNativeScript = registerScript(
  loadScript('renew-native-session-authority.lua', import.meta.url),
)
async function renewNativeAuthority(
  authority: NativeSessionAuthority,
  expectedState: string,
  issuedAt: number,
): Promise<NativeSessionAuthority> {
  const renewed = {
    ...authority,
    deviceIssuedAt: issuedAt,
    deviceExpiresAt: issuedAt + DEVICE_EXPIRATION_SECONDS,
  }
  const result = await sessionValkeyClient.invokeScript(renewNativeScript, {
    keys: [
      getWebSessionAuthorityKey(authority.sid),
      getJwtRevokedKey(authority.sid),
      getJwtUserRevokedBeforeKey(authority.uid),
    ],
    args: [
      expectedState,
      JSON.stringify(renewed),
      String(
        Math.max(1, renewed.deviceExpiresAt - Math.floor(Date.now() / 1000)) +
          RETENTION_MARGIN_SECONDS,
      ),
      String(authority.deviceIssuedAt),
    ],
  })
  if (Number(result) !== 1) throw sessionAuthorityRequired()
  return renewed
}

async function hasSessionMintReceipt(sid: string): Promise<boolean> {
  const { rows } = await write(sql`/* hasSessionMintReceipt */
    SELECT EXISTS (SELECT 1 FROM user_sessions WHERE id = ${sid}) AS present
  `)
  return rows[0].present === true
}
