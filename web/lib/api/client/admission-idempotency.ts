'use client'

import { AdmissionIdempotency } from '@vouchington/api-client'
import { reportClientError } from './report-error'

export const admissionIdempotency = new AdmissionIdempotency(undefined, {
  namespace: 'voucha',
  transientFields: ['cf_turnstile_response', 'recaptcha_token', 'hp_website', 'hp_phone'],
  onError: reportClientError,
})
