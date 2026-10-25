'use client'

import { parseErrorResponseBody } from '@vouchington/api-client'
import {
  BOT_CHALLENGE_ACTION_TAG,
  BOT_CHALLENGE_REQUIRED,
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
} from '@ts-shared/utils/bot-challenge'
import { buildLoginHref } from '@/lib/auth/login-url'
import { requestBotChallengeToken } from './bot-challenge'
import { reportClientError } from './report-error'
import { renewBrowserSession } from './session-renewal'

type BotChallengeSolver = (action: string, signal?: AbortSignal) => Promise<string>

/** The application owns one finite renewal-then-challenge replay sequence. */
export function createAuthRecoveryFetch(
  solve: BotChallengeSolver = requestBotChallengeToken,
): typeof fetch {
  return async (input, init) => {
    let response = await fetch(input, init)
    const signal = init?.signal ?? undefined

    if (response.status === 401 && !isSessionEndpoint(input)) {
      const error = await readError(response)
      if (isErrorCode(error, 'AUTH_REQUIRED')) {
        let renewed: boolean
        try {
          renewed = await renewBrowserSession()
        } catch (err) {
          redirectToLogin()
          throw err
        }
        // A verified anonymous renewal has no identity to recover. Preserve the original 401.
        if (!renewed) return response
        signal?.throwIfAborted()
        response = await fetch(input, init)
      }
    }

    if (response.status === 403) {
      const error = await readError(response)
      if (isBotChallenge(error)) {
        signal?.throwIfAborted()
        const token = await solve(error.action, signal)
        signal?.throwIfAborted()
        const headers = new Headers(init?.headers)
        headers.set(VOUCHA_BOT_CHALLENGE_TOKEN_HEADER, token)
        response = await fetch(input, { ...init, headers })
      }
    }

    if (response.status === 401) {
      const error = await readError(response)
      if (isErrorCode(error, 'AUTH_REQUIRED') || isReloginError(error)) redirectToLogin()
    }
    return response
  }
}

function isSessionEndpoint(input: RequestInfo | URL): boolean {
  const raw = input instanceof Request ? input.url : input.toString()
  return new URL(raw, 'https://example.invalid').pathname === '/api/v1/session'
}

function readError(response: Response): Promise<unknown> {
  return parseErrorResponseBody(response.clone(), { onError: reportClientError })
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    !Array.isArray(error) &&
    (error as { code?: unknown }).code === code
  )
}

function isReloginError(error: unknown): boolean {
  return [
    'SESSION_USER_AGENT_MISMATCH',
    'SESSION_JA4_MISMATCH',
    'SESSION_RELOGIN_REQUIRED',
    'SESSION_REFRESH_REUSED',
  ].some(code => isErrorCode(error, code))
}

function isBotChallenge(
  error: unknown,
): error is { action: typeof BOT_CHALLENGE_ACTION_TAG; code: typeof BOT_CHALLENGE_REQUIRED } {
  return (
    isErrorCode(error, BOT_CHALLENGE_REQUIRED) &&
    (error as { action?: unknown }).action === BOT_CHALLENGE_ACTION_TAG
  )
}

function redirectToLogin(): void {
  window.location.assign(
    buildLoginHref({ next: `${window.location.pathname}${window.location.search}` }),
  )
}
