'use client'

import * as Sentry from '@sentry/nextjs'
import { parseErrorResponseBody } from '@vouchington/api-client'
import {
  BOT_CHALLENGE_ACTION_TAG,
  BOT_CHALLENGE_REQUIRED,
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
} from '@ts-shared/utils/bot-challenge'
import { requestBotChallengeToken } from './bot-challenge'

type BotChallengeSolver = (action: string, signal?: AbortSignal) => Promise<string>

/**
 * Wraps fetch so a low-score 403 challenge is solved and the unchanged request replayed once.
 * A failed solve or a repeated challenge response surfaces as the request's error.
 */
export function createBotChallengeFetch(
  solve: BotChallengeSolver = requestBotChallengeToken,
): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init)
    if (response.status !== 403) return response
    const errorData = await parseErrorResponseBody(response.clone(), {
      onError: error => Sentry.captureException(error),
    })
    if (!isBotChallenge(errorData)) return response

    const signal = init?.signal ?? undefined
    signal?.throwIfAborted()
    const token = await solve(errorData.action, signal)
    signal?.throwIfAborted()
    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string>),
        [VOUCHA_BOT_CHALLENGE_TOKEN_HEADER]: token,
      },
    })
  }
}

function isBotChallenge(
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
