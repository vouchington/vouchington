import type * as jose from 'jose'

export const SESSION_JWT_ISSUER = 'voucha.ai'
export const EDGE_ANON_SESSION_JWT_ISSUER = 'voucha.ai:edge-anon'
export const SESSION_JWT_PRIVATE_KEYS_ENV = 'VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64'
export const SESSION_JWT_PUBLIC_KEYS_ENV = 'VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64'
export const EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_ENV =
  'VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64'
export const EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_ENV = 'VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64'
export const DEVICE_TOKEN_AUDIENCE = 'voucha:device'
export const SESSION_TOKEN_AUDIENCE = 'voucha:session'

export type JwtRuntimeMode = 'production' | 'development' | 'test'

export interface SessionJwtEnvironment {
  VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64?: string
  VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64?: string
}

export interface JwtRuntimeOptions {
  env?: SessionJwtEnvironment
  issuer?: string
  mode?: JwtRuntimeMode
}

export interface JwtSignOptions extends JwtRuntimeOptions {
  expiresIn: string | number | Date
  issuedAt?: number
}

export type DeviceClass = 'attested'

export const KNOWN_DEVICE_CLASSES = new Set<DeviceClass>(['attested'])

export function isOptionalDeviceClass(value: unknown): value is DeviceClass | undefined {
  return value === undefined || KNOWN_DEVICE_CLASSES.has(value as DeviceClass)
}

export interface DeviceTokenPayload extends jose.JWTPayload {
  did: string
  dc?: DeviceClass
}

export interface SessionTokenPayload extends jose.JWTPayload {
  did: string
  sid: string
  uid: string | null
  // Present only when uid is non-null (authenticated sessions)
  rol?: readonly string[] // user roles (e.g. ['administrator'])
  mpl?: string | null // membership plan slug ('plus' | 'pro')
  mpe?: number // membership plan expiry: Unix epoch seconds
  tt?: number // pre-computed trust tier (0-5)
  rca?: number // recheck-after: Unix epoch seconds — re-read user from DB after this time
  sca?: number // session-check-after: Unix epoch seconds — check Valkey for revocation/staleness
  uil?: string | null // preferred UI locale from supported UI catalogs (e.g. 'en')
}
