'use client'

/**
 * Singleton instance of ClientRequest for Client Components
 */

import { ClientRequest } from '@vouchington/api-client'
import { authRecoveryFetch } from './auth-recovery-fetch'
import { reportClientError } from './report-error'

export const clientApi = new ClientRequest({
  fetch: authRecoveryFetch,
  onError: reportClientError,
  retryAfterConflictCodes: ['CONTRIBUTION_ADMISSION_IN_PROGRESS'],
})
