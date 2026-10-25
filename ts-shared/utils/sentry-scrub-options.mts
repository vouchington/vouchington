import type { ScrubOptions } from '@vouchington/utils/observability'
import { redactObservabilityUrl } from './observability-scrubbing.mts'
import {
  VOUCHA_BOT_CHALLENGE_APP_ATTEST_ASSERTION_HEADER,
  VOUCHA_BOT_CHALLENGE_APP_ATTEST_CHALLENGE_ID_HEADER,
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
} from './bot-challenge.mts'

const CREDENTIAL_HEADER_NAMES: readonly string[] = Object.freeze([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'cf-access-jwt-assertion',
  'x-cf-worker-secret',
  'x-bedrock-batch-shared-key',
  'x-voucha-cache-purge-secret',
  'x-app-attest-assertion',
  'x-app-attest-nonce',
  'x-app-attest-challenge-id',
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
  VOUCHA_BOT_CHALLENGE_APP_ATTEST_ASSERTION_HEADER,
  VOUCHA_BOT_CHALLENGE_APP_ATTEST_CHALLENGE_ID_HEADER,
  'stripe-signature',
  'signature',
  'copyright-guest-capability',
  'idempotency-key',
  'cookie',
])

export const SENTRY_SCRUB_OPTIONS: ScrubOptions = {
  credentialHeaders: CREDENTIAL_HEADER_NAMES,
  redactUrl: redactObservabilityUrl,
  dropRequestBody: true,
}
