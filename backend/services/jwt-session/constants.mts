import { loadScript, registerScript } from '@data-stores/valkey/scripts'

// Valkey key prefix. The stale-marker key prefix lives with its logic in
// @data-stores/valkey/jwt-stale.
const REVOKED_PREFIX = 'voucha:jwt-revoked:'
const USER_REVOKED_BEFORE_PREFIX = 'voucha:jwt-user-revoked-before:'
const LOGOUT_CLEANUP_PREFIX = 'voucha:jwt-logout-cleanup:'
const LOGOUT_CLEANUP_ADMISSION_PREFIX = 'voucha:jwt-logout-cleanup-admission:'
const LOGOUT_CLEANUP_FENCE_PREFIX = 'voucha:jwt-logout-cleanup-fence:'
const LOGOUT_PUSH_CLEANUP_COMPLETION_PREFIX = 'voucha:jwt-logout-push-cleanup-completed:'

export function getJwtRevokedKey(sid: string): string {
  return `${REVOKED_PREFIX}${sid}`
}

export function getJwtUserRevokedBeforeKey(userId: string): string {
  return `${USER_REVOKED_BEFORE_PREFIX}${userId}`
}

export function getJwtLogoutCleanupKey(sessionId: string): string {
  return `${LOGOUT_CLEANUP_PREFIX}${sessionId}`
}

export function getJwtLogoutCleanupAdmissionKey(sessionId: string): string {
  return `${LOGOUT_CLEANUP_ADMISSION_PREFIX}${sessionId}`
}

export function getJwtLogoutCleanupFenceKey(sessionId: string): string {
  return `${LOGOUT_CLEANUP_FENCE_PREFIX}${sessionId}`
}

export function getJwtLogoutPushCleanupCompletionKey(
  sessionId: string,
  bindingDigest: string,
): string {
  return `${LOGOUT_PUSH_CLEANUP_COMPLETION_PREFIX}${sessionId}:${bindingDigest}`
}

// Lua script to check revocation + staleness in one roundtrip (warm path)
export const checkRevokedAndStaleScript = registerScript(
  loadScript('check-revoked-and-stale.lua', import.meta.url),
)

export const admitLogoutCleanupScript = registerScript(
  loadScript('admit-logout-cleanup.lua', import.meta.url),
)

export const commitLogoutRevocationScript = registerScript(
  loadScript('commit-logout-revocation.lua', import.meta.url),
)
