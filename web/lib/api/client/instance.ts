'use client'

/**
 * Singleton instance of ClientRequest for Client Components
 */

import * as Sentry from '@sentry/nextjs'
import { ClientRequest } from '@vouchington/api-client'
import { createBotChallengeFetch } from './bot-challenge-fetch'

export const clientApi = new ClientRequest({
  fetch: createBotChallengeFetch(),
  onError: error => Sentry.captureException(error),
  retryAfterConflictCodes: ['CONTRIBUTION_ADMISSION_IN_PROGRESS'],
})
