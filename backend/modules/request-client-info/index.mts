import { AsyncLocalStorage } from 'node:async_hooks'
import type { ClientFamily, RequestClientInfo } from '@ts-shared/request-client-info'
import type { IncomingMessage } from 'node:http'
import type { DeviceTokenPayload } from '@ts-shared/session-jwt'

export type SessionRequestOrigin = {
  interface: 'rest'
  credential: 'session'
  // Null when the request's client information is missing or invalid (observe mode only).
  client: ClientFamily | null
  oauthClientId: null
}
export type CredentialRequestOrigin =
  | { interface: 'rest' | 'mcp'; credential: 'api_key'; client: null; oauthClientId: null }
  // `oauthClientId` is the `oauth_clients.id` row that the access token was issued to.
  | { interface: 'rest' | 'mcp'; credential: 'oauth'; client: null; oauthClientId: string }
export type RequestOrigin = SessionRequestOrigin | CredentialRequestOrigin

// The error code both the listener (enforce mode) and content writers return for bad client info.
export const INVALID_CLIENT_INFO_CODE = 'INVALID_CLIENT_INFO'

type RequestContext = Readonly<{
  origin: Readonly<RequestOrigin>
  clientInfo: Readonly<RequestClientInfo> | null
}>

const requestContextStorage = new AsyncLocalStorage<RequestContext>()
export type VerifiedDeviceIdentity = Pick<DeviceTokenPayload, 'did' | 'dc'>
const verifiedDeviceTokens = new WeakMap<
  IncomingMessage,
  { token: string; payload: VerifiedDeviceIdentity }
>()
const bootstrapDeviceIds = new WeakMap<IncomingMessage, string>()

// The session origin's client comes from the validated client information, so the two can't
// disagree. `null` records a session request whose client information failed validation.
export function runWithSessionRequestContext<T>(
  clientInfo: RequestClientInfo | null,
  callback: () => T,
): T {
  const origin: SessionRequestOrigin = {
    interface: 'rest',
    credential: 'session',
    client: clientInfo?.client ?? null,
    oauthClientId: null,
  }
  return requestContextStorage.run(
    Object.freeze({
      origin: Object.freeze(origin),
      clientInfo: clientInfo ? Object.freeze({ ...clientInfo }) : null,
    }),
    callback,
  )
}

export function runWithCredentialRequestContext<T>(
  origin: CredentialRequestOrigin,
  callback: () => T,
): T {
  return requestContextStorage.run(
    Object.freeze({ origin: Object.freeze({ ...origin }), clientInfo: null }),
    callback,
  )
}

export function getOptionalRequestOrigin(): Readonly<RequestOrigin> | undefined {
  return requestContextStorage.getStore()?.origin
}

export function getOptionalRequestClientInfo(): Readonly<RequestClientInfo> | undefined {
  return requestContextStorage.getStore()?.clientInfo ?? undefined
}

export function getRequestClientInfo(): Readonly<RequestClientInfo> {
  const value = getOptionalRequestClientInfo()
  if (!value) throw new Error('Request client information accessed outside a request')
  return value
}

export type { RequestClientInfo } from '@ts-shared/request-client-info'

export function cacheVerifiedDeviceToken(
  request: IncomingMessage,
  token: string,
  payload: VerifiedDeviceIdentity,
): void {
  verifiedDeviceTokens.set(request, { token, payload })
}

export function getCachedVerifiedDeviceToken(
  request: IncomingMessage,
  token: string,
): VerifiedDeviceIdentity | undefined {
  const cached = verifiedDeviceTokens.get(request)
  return cached?.token === token ? cached.payload : undefined
}

export function cacheBootstrapDeviceId(request: IncomingMessage, deviceId: string): void {
  bootstrapDeviceIds.set(request, deviceId)
}

export function getCachedBootstrapDeviceId(request: IncomingMessage): string | undefined {
  return bootstrapDeviceIds.get(request)
}
