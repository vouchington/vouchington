import type { JWK } from 'jose'
import { sessionAuthorityRequired } from './dbsc-errors.mts'

interface SessionAuthorityIdentity {
  uid: string
  did: string
  sid: string
  deviceExpiresAt: number
  deviceIssuedAt: number
}
export interface WebSessionAuthority extends SessionAuthorityIdentity {
  client: 'web'
  uaHash: string
  kind: 'unbound' | 'bound'
  origin?: string
  publicKey?: JWK
  registrationNonce: string
  registrationExpiresAt: number
}
export interface NativeSessionAuthority extends SessionAuthorityIdentity {
  client: 'native'
}
export type SessionMintAuthority = WebSessionAuthority | NativeSessionAuthority
export interface DbscChallenge {
  purpose: 'registration' | 'refresh'
  uid: string
  did: string
  sid: string
  origin: string
}

function isValidBoundAuthority(authority: WebSessionAuthority): boolean {
  try {
    if (
      !authority.origin ||
      new URL(authority.origin).origin !== authority.origin ||
      new URL(authority.origin).protocol !== 'https:'
    )
      return false
    const key = authority.publicKey
    return (
      !!key &&
      key.kty === 'EC' &&
      key.crv === 'P-256' &&
      key.d === undefined &&
      typeof key.x === 'string' &&
      /^[A-Za-z0-9_-]{43}$/u.test(key.x) &&
      typeof key.y === 'string' &&
      /^[A-Za-z0-9_-]{43}$/u.test(key.y)
    )
  } catch {
    return false
  }
}

export function parseSessionMintAuthority(raw: string): SessionMintAuthority {
  try {
    const authority = JSON.parse(raw) as SessionMintAuthority
    if (
      !authority ||
      typeof authority.uid !== 'string' ||
      typeof authority.did !== 'string' ||
      typeof authority.sid !== 'string' ||
      !Number.isFinite(authority.deviceIssuedAt) ||
      !Number.isFinite(authority.deviceExpiresAt)
    )
      throw sessionAuthorityRequired()
    if (authority.client === 'native') {
      if (
        [
          'uaHash',
          'kind',
          'origin',
          'publicKey',
          'registrationNonce',
          'registrationExpiresAt',
        ].some(key => key in authority)
      )
        throw sessionAuthorityRequired()
      return authority
    }
    if (
      authority.client !== 'web' ||
      typeof authority.uaHash !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(authority.uaHash) ||
      typeof authority.registrationNonce !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/u.test(authority.registrationNonce) ||
      !Number.isFinite(authority.registrationExpiresAt) ||
      (authority.origin !== undefined && !isCanonicalOrigin(authority.origin)) ||
      (authority.kind !== 'unbound' && authority.kind !== 'bound') ||
      (authority.kind === 'unbound' && authority.publicKey !== undefined) ||
      (authority.kind === 'bound' && !isValidBoundAuthority(authority))
    )
      throw sessionAuthorityRequired()
    return authority
  } catch {
    throw sessionAuthorityRequired()
  }
}
export function isCanonicalOrigin(origin: string, httpsOnly = false): boolean {
  try {
    const url = new URL(origin)
    return (
      url.origin === origin &&
      (url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:'))
    )
  } catch {
    return false
  }
}
