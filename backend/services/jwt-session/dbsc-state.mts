import {
  parseSessionMintAuthority,
  type WebSessionAuthority,
  type DbscChallenge,
} from './dbsc-state-schema.mts'
import { sessionAuthorityRequired } from './dbsc-errors.mts'
export type { WebSessionAuthority, DbscChallenge } from './dbsc-state-schema.mts'
export { sessionAuthorityRequired } from './dbsc-errors.mts'
import { TimeUnit } from '@valkey/valkey-glide'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import { randomBytes } from 'node:crypto'
import { getJwtRevokedKey, getJwtUserRevokedBeforeKey } from './constants.mts'

const STATE_PREFIX = 'voucha:dbsc-session:'
const CHALLENGE_PREFIX = 'voucha:dbsc-challenge:'
export const CHALLENGE_SECONDS = 300
export const RETENTION_MARGIN_SECONDS = 3600
const commitProofScript = registerScript(loadScript('commit-dbsc-proof.lua', import.meta.url))

export function getWebSessionAuthorityKey(sid: string): string {
  return `${STATE_PREFIX}${sid}`
}

export async function readWebSessionAuthority(expected: {
  uid: string
  did: string
  sid: string
  uaHash?: string
  deviceExpiresAt?: number
  deviceIssuedAt?: number
}): Promise<{ authority: WebSessionAuthority; raw: string }> {
  const value = await sessionValkeyClient.get(getWebSessionAuthorityKey(expected.sid))
  if (value === null) throw sessionAuthorityRequired()
  const raw = String(value)
  const authority = parseSessionMintAuthority(raw)
  if (
    authority.client !== 'web' ||
    authority.uid !== expected.uid ||
    authority.did !== expected.did ||
    authority.sid !== expected.sid ||
    authority.uaHash !== expected.uaHash ||
    authority.deviceExpiresAt !== expected.deviceExpiresAt ||
    (expected.deviceIssuedAt !== undefined && authority.deviceIssuedAt !== expected.deviceIssuedAt)
  )
    throw sessionAuthorityRequired()
  return { authority, raw }
}

export async function issueDbscChallenge(challenge: DbscChallenge): Promise<string> {
  const nonce = randomBytes(32).toString('base64url')
  await sessionValkeyClient.set(getDbscChallengeKey(nonce), JSON.stringify(challenge), {
    expiry: { type: TimeUnit.Seconds, count: CHALLENGE_SECONDS },
  })
  return nonce
}

export async function consumeDbscChallenge(options: {
  nonce: string
  challenge: DbscChallenge
  expectedState: string
  nextState?: WebSessionAuthority
  deviceIssuedAt: number
}): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(options.nonce)) return false
  const result = await sessionValkeyClient.invokeScript(commitProofScript, {
    keys: [
      getDbscChallengeKey(options.nonce),
      getWebSessionAuthorityKey(options.challenge.sid),
      getJwtRevokedKey(options.challenge.sid),
      getJwtUserRevokedBeforeKey(options.challenge.uid),
    ],
    args: [
      JSON.stringify(options.challenge),
      options.expectedState,
      options.nextState ? JSON.stringify(options.nextState) : '',
      String(options.deviceIssuedAt),
    ],
  })
  return Number(result) === 1
}

export function getDbscChallengeKey(nonce: string): string {
  return `${CHALLENGE_PREFIX}${nonce}`
}
