import type { DeviceClass } from './types.mts'

// Session and device token expiration — shared across backend and Cloudflare Worker.
// Tokens have this maximum lifetime (time from issuance).
export const SESSION_EXPIRATION_STRING = '2 days'
export const SESSION_EXPIRATION_SECONDS = 2 * 24 * 60 * 60 // 2 days
export const DEVICE_EXPIRATION_STRING = '30 days'
export const DEVICE_EXPIRATION_SECONDS = 30 * 24 * 60 * 60 // 30 days
// Attested devices (Apple App Attest) get a longer session lifetime; the dt stays at 30 days either way.
export const ATTESTED_SESSION_EXPIRATION_STRING = '30 days'
export const ATTESTED_SESSION_EXPIRATION_SECONDS = 30 * 24 * 60 * 60 // 30 days

export function sessionExpiryFor(dc?: DeviceClass): string {
  return dc === 'attested' ? ATTESTED_SESSION_EXPIRATION_STRING : SESSION_EXPIRATION_STRING
}

export function sessionExpirySecondsFor(dc?: DeviceClass): number {
  return dc === 'attested' ? ATTESTED_SESSION_EXPIRATION_SECONDS : SESSION_EXPIRATION_SECONDS
}

// Stateless session check intervals (seconds)
// How often to re-read user data from the DB (roles, membership, trust tier)
export const RECHECK_AFTER_SECONDS = 30 * 60 // 30 minutes
// How often to check Valkey for session revocation / JWT staleness
export const SESSION_CHECK_AFTER_SECONDS = 5 * 60 // 5 minutes
