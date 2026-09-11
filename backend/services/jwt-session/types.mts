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
}

export type { DeviceClass, DeviceTokenPayload, SessionTokenPayload }

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
  exp?: number
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
