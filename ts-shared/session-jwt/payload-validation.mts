import type { JWTPayload } from 'jose'
import { validate as isUUID } from 'uuid'
import { isUuidv7 as isUUIDv7 } from '@vouchington/session-jwt'
import {
  isOptionalDeviceClass,
  type DeviceTokenPayload,
  type SessionTokenPayload,
} from './types.mts'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

export function isValidDevicePayload(payload: JWTPayload): payload is DeviceTokenPayload {
  return (
    isNonEmptyString(payload.did) &&
    isUUIDv7(payload.did) &&
    isOptionalDeviceClass(payload.dc) &&
    isValidClientBinding(payload) &&
    (payload.refresh_uid === undefined ||
      (typeof payload.refresh_uid === 'string' && isUUID(payload.refresh_uid))) &&
    (payload.refresh_sid === undefined ||
      (typeof payload.refresh_sid === 'string' && isUUIDv7(payload.refresh_sid)))
  )
}

export function isValidSessionPayload(payload: JWTPayload): payload is SessionTokenPayload {
  return (
    isValidClientBinding(payload) &&
    isNonEmptyString(payload.did) &&
    isUUIDv7(payload.did) &&
    isNonEmptyString(payload.sid) &&
    isUUIDv7(payload.sid) &&
    (payload.uid === null || (isNonEmptyString(payload.uid) && isUUID(payload.uid))) &&
    (payload.rol === undefined ||
      (Array.isArray(payload.rol) && payload.rol.every(role => typeof role === 'string'))) &&
    (payload.mpl === undefined || payload.mpl === null || typeof payload.mpl === 'string') &&
    isOptionalFiniteNumber(payload.mpe) &&
    isOptionalFiniteNumber(payload.tt) &&
    isOptionalFiniteNumber(payload.rca) &&
    isOptionalFiniteNumber(payload.sca) &&
    (payload.uil === undefined || payload.uil === null || typeof payload.uil === 'string')
  )
}
function isValidClientBinding(payload: JWTPayload): boolean {
  return (
    (payload.dbsc === undefined || payload.dbsc === true) &&
    (payload.client === undefined || payload.client === 'web' || payload.client === 'native') &&
    (payload.ja4_hash === undefined ||
      (typeof payload.ja4_hash === 'string' && /^[a-f0-9]{64}$/u.test(payload.ja4_hash))) &&
    (payload.ua_hash === undefined ||
      (typeof payload.ua_hash === 'string' && /^[a-f0-9]{64}$/u.test(payload.ua_hash)))
  )
}
