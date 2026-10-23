import type { JWK } from 'jose'
import { sessionAuthorityRequired } from './dbsc-errors.mts'

export interface DeviceBoundSessionBinding {
  publicKey: JWK
  origin: string
  boundAt: string
}

export interface WebSessionAuthority {
  uid: string
  did: string
  sid: string
  deviceExpiresAt: number
  deviceIssuedAt: number
  client: 'web'
  uaHash: string
  ja4Hash?: string
  kind: 'unbound' | 'bound'
  origin?: string
  publicKey?: JWK
}

export interface DbscChallenge {
  purpose: 'registration' | 'refresh'
  uid: string
  did: string
  sid: string
  origin: string
}

export function parseDeviceBoundSessionBinding(value: unknown): DeviceBoundSessionBinding {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw sessionAuthorityRequired()
  const binding = value as Record<string, unknown>
  if (
    Object.keys(binding).some(key => !['publicKey', 'origin', 'boundAt'].includes(key)) ||
    typeof binding.origin !== 'string' ||
    !isCanonicalOrigin(binding.origin, true) ||
    typeof binding.boundAt !== 'string' ||
    !Number.isFinite(Date.parse(binding.boundAt))
  )
    throw sessionAuthorityRequired()
  return {
    publicKey: parseDbscPublicKey(binding.publicKey),
    origin: binding.origin,
    boundAt: binding.boundAt,
  }
}

export function parseDbscPublicKey(value: unknown): JWK {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw sessionAuthorityRequired()
  const key = value as JWK
  if (
    key.kty !== 'EC' ||
    key.crv !== 'P-256' ||
    key.d !== undefined ||
    typeof key.x !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(key.x) ||
    typeof key.y !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(key.y)
  )
    throw sessionAuthorityRequired()
  return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }
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
