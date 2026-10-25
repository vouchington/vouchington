'use client'

/**
 * Singleton instance of ClientRequest for Client Components
 */

import { ClientRequest } from '@vouchington/api-client'
import { createBotChallengeFetch } from './bot-challenge-fetch'
import { reportClientError } from './report-error'

export const clientApi = new ClientRequest({
  fetch: createBotChallengeFetch(),
  onError: reportClientError,
  retryAfterConflictCodes: ['CONTRIBUTION_ADMISSION_IN_PROGRESS'],
})
