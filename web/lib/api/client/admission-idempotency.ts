'use client'

import * as Sentry from '@sentry/nextjs'
import { AdmissionIdempotency } from '@vouchington/api-client'

export const admissionIdempotency = new AdmissionIdempotency(undefined, {
  namespace: 'voucha',
  transientFields: ['cf_turnstile_response', 'recaptcha_token', 'hp_website', 'hp_phone'],
  onError: error => Sentry.captureException(error),
})
