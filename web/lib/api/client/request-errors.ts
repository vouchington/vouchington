import { buildLoginHref } from '@/lib/auth/login-url'
import { BOT_CHALLENGE_ACTION_TAG, BOT_CHALLENGE_REQUIRED } from '@ts-shared/utils/bot-challenge'
import { ApiError } from '../error'

export function throwApiError(response: Response, errorData: unknown): never {
  if (
    isReloginError(errorData) ||
    (response.status === 401 && isErrorCode(errorData, 'AUTH_REQUIRED'))
  )
    redirectToLogin()
  const isAdmissionInProgress =
    response.status === 409 && isErrorCode(errorData, 'CONTRIBUTION_ADMISSION_IN_PROGRESS')
  if (response.status === 429 || isAdmissionInProgress) {
    const retryAfter = response.headers.get('Retry-After')
    const parsed = retryAfter ? parseInt(retryAfter, 10) : NaN
    const retrySeconds = !isNaN(parsed) && parsed > 0 ? parsed : undefined
    const rateLimitData =
      typeof errorData === 'object' && errorData !== null && !Array.isArray(errorData)
        ? { ...errorData, retry_after: retrySeconds }
        : { retry_after: retrySeconds }
    throw new ApiError(`API request failed: ${response.statusText}`, response.status, rateLimitData)
  }

  throw new ApiError(`API request failed: ${response.statusText}`, response.status, errorData)
}

export function isBotChallenge(
  errorData: unknown,
): errorData is { action: typeof BOT_CHALLENGE_ACTION_TAG; code: typeof BOT_CHALLENGE_REQUIRED } {
  return (
    typeof errorData === 'object' &&
    errorData !== null &&
    !Array.isArray(errorData) &&
    (errorData as { code?: unknown }).code === BOT_CHALLENGE_REQUIRED &&
    (errorData as { action?: unknown }).action === BOT_CHALLENGE_ACTION_TAG
  )
}

export function isErrorCode(errorData: unknown, code: string): boolean {
  return (
    typeof errorData === 'object' &&
    errorData !== null &&
    !Array.isArray(errorData) &&
    (errorData as { code?: unknown }).code === code
  )
}

function isReloginError(errorData: unknown): boolean {
  return [
    'SESSION_USER_AGENT_MISMATCH',
    'SESSION_JA4_MISMATCH',
    'SESSION_RELOGIN_REQUIRED',
    'SESSION_REFRESH_REUSED',
  ].some(code => isErrorCode(errorData, code))
}

export function redirectToLogin(): void {
  window.location.assign(
    buildLoginHref({ next: `${window.location.pathname}${window.location.search}` }),
  )
}
