import { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestClientInfo } from '@ts-shared/request-client-info'
import type { IncomingMessage } from 'node:http'
import type { DeviceTokenPayload } from '@ts-shared/session-jwt'

const requestClientInfoStorage = new AsyncLocalStorage<Readonly<RequestClientInfo>>()
export type VerifiedDeviceIdentity = Pick<DeviceTokenPayload, 'did' | 'dc'>
const verifiedDeviceTokens = new WeakMap<
  IncomingMessage,
  { token: string; payload: VerifiedDeviceIdentity }
>()
const bootstrapDeviceIds = new WeakMap<IncomingMessage, string>()

export function runWithRequestClientInfo<T>(value: RequestClientInfo, callback: () => T): T {
  return requestClientInfoStorage.run(Object.freeze({ ...value }), callback)
}

export function getOptionalRequestClientInfo(): Readonly<RequestClientInfo> | undefined {
  return requestClientInfoStorage.getStore()
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
