import type { TransactionQuery } from '@data-stores/psql/types'
import type { DeviceClass, DeviceTokenPayload, SessionTokenPayload } from '@ts-shared/session-jwt'
import type { PrivateUser } from '@voucha/types/entities/user'

// Lazily resolves the user for a uid discovered mid-refresh. Injected by callers instead of
// imported from @services/users so jwt-session never depends on @services/users directly
// (that dependency would recreate a users<->jwt-session workspace cycle).
export type FetchUserForSession = (userId: string) => Promise<PrivateUser | null>

export type RefreshedSessionState = {
  did: string
  dt: string
  st: string
  sid: string
  uid: string | null
  session: SessionTokenPayload
  deviceClass?: DeviceClass
}

export interface DeviceContext {
  ip_address?: string
  user_agent?: string
  ja4?: string
}

export type { DeviceClass, DeviceTokenPayload, SessionTokenPayload }

export interface DbscAuthorization {
  readonly sid: string
  readonly deviceTokenDigest: string
  readonly purpose: 'registration' | 'refresh'
  readonly registrationBinding?: import('./dbsc-state-schema.mts').DeviceBoundSessionBinding
}

export interface DeviceTokenResult {
  token: string
  payload: DeviceTokenPayload
}

export interface SessionTokenResult {
  token: string
  payload: SessionTokenPayload
}

export interface DeviceAndSessionTokenResult {
  deviceToken: DeviceTokenResult
  sessionToken: SessionTokenResult
}

export interface VerifyDeviceAndSessionTokenResult {
  did: string
  sid: string
  uid: string | null
  client?: 'web' | 'native'
  ua_hash?: string
  ja4_hash?: string
  exp?: number
  device_exp?: number
  device_iat?: number
  iat?: number
  rol?: readonly string[]
  mpl?: string | null
  mpe?: number
  tt?: number
  uil?: string | null
  rca?: number
  sca?: number
  dc?: DeviceClass
}

export type SessionClientBinding =
  | { client: 'web'; ua_hash: string; ja4_hash?: string }
  | { client: 'native' }

export interface SessionMintOptions {
  query?: TransactionQuery
  did: string
  sid?: string
  uid?: string | null
  roles?: readonly string[]
  membershipPlan?: string | null
  membershipExpiresAt?: Date | null
  trustTier?: number
  uiLocale?: string | null
  eventType?: import('@data-stores/analytics').AuthSessionRecord['event_type']
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  authOrigin?: 'web' | 'native'
  recheckAfter?: number
  clientBinding?: SessionClientBinding
  sessionExpiresAt?: Date
  clock?: () => number
  credentialReplay?: boolean
  deviceRenewal?: 'verified-native-attestation'
}
