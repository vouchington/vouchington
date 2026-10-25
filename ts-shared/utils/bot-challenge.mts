import { toTurnstileAction } from './turnstile-action.mts'

/** Trusted Cloudflare metadata. Public callers must never be able to supply this header. */
export const VOUCHA_BOT_SCORE_HEADER = 'x-voucha-bot-score'

/** A distinct single-use proof for the generic low-score mutation gate. */
export const VOUCHA_BOT_CHALLENGE_TOKEN_HEADER = 'x-voucha-bot-challenge-token'

/** Selects the native proof headers; the marker itself grants no authority. */
export const BOT_CHALLENGE_NATIVE_PROOF = 'app-attest'
export const VOUCHA_BOT_CHALLENGE_APP_ATTEST_KEY_ID_HEADER =
  'x-voucha-bot-challenge-app-attest-key-id'
export const VOUCHA_BOT_CHALLENGE_APP_ATTEST_ASSERTION_HEADER =
  'x-voucha-bot-challenge-app-attest-assertion'
export const VOUCHA_BOT_CHALLENGE_APP_ATTEST_CHALLENGE_ID_HEADER =
  'x-voucha-bot-challenge-app-attest-challenge-id'

export const BOT_CHALLENGE_ACTION_TAG = 'bot-challenge.mutation'
export const BOT_CHALLENGE_ACTION = toTurnstileAction(BOT_CHALLENGE_ACTION_TAG)
export const BOT_CHALLENGE_REQUIRED = 'BOT_CHALLENGE_REQUIRED'
