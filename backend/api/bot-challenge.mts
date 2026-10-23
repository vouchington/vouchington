import type { Context } from '@jongleberry/api-server'
import createHttpError from 'http-errors'
import { getTrustedCloudflareBotScore } from '@modules/request-client-info/cloudflare-bot-score'
import { getOptionalRequestOrigin } from '@modules/request-client-info'
import { BOT_CHALLENGE_REQUIRED } from '@modules/on-error/error-codes'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  BOT_CHALLENGE_ACTION_TAG,
  BOT_CHALLENGE_NATIVE_PROOF,
  VOUCHA_BOT_CHALLENGE_APP_ATTEST_ASSERTION_HEADER,
  VOUCHA_BOT_CHALLENGE_APP_ATTEST_CHALLENGE_ID_HEADER,
  VOUCHA_BOT_CHALLENGE_APP_ATTEST_KEY_ID_HEADER,
  VOUCHA_BOT_CHALLENGE_TOKEN_HEADER,
} from '@ts-shared/utils/bot-challenge'

const LOW_BOT_SCORE_MAX = 29
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const verificationByRequest = new WeakMap<object, Promise<void>>()

type BotChallengeRequiredError = Error & {
  action: typeof BOT_CHALLENGE_ACTION_TAG
  code: typeof BOT_CHALLENGE_REQUIRED
  status: number
}

export async function enforceLowScoreBotChallenge(ctx: Context): Promise<void> {
  if (!MUTATING_METHODS.has(ctx.req.method?.toUpperCase() ?? 'GET')) return
  if (getOptionalRequestOrigin()?.credential !== 'session') return
  const score = getTrustedCloudflareBotScore(ctx.req)
  if (score === undefined || score > LOW_BOT_SCORE_MAX) return

  const existing = verificationByRequest.get(ctx.req)
  if (existing) return existing
  const verification = verifyLowScoreProof(ctx)
  verificationByRequest.set(ctx.req, verification)
  return verification
}

async function verifyLowScoreProof(ctx: Context): Promise<void> {
  await ctx.verifyAttestedRequestSignature()
  const token = singleHeader(ctx.req.headers[VOUCHA_BOT_CHALLENGE_TOKEN_HEADER])
  const useNativeChallenge = token === BOT_CHALLENGE_NATIVE_PROOF
  await verifyCaptchaOrAttestation(
    ctx,
    { [VOUCHA_BOT_CHALLENGE_TOKEN_HEADER]: useNativeChallenge ? undefined : token },
    {
      actionTag: BOT_CHALLENGE_ACTION_TAG,
      fieldNames: [VOUCHA_BOT_CHALLENGE_TOKEN_HEADER],
      createMissingTokenError: createBotChallengeRequiredError,
      nativeChallengeHeaders: useNativeChallenge
        ? {
            assertion: singleHeader(
              ctx.req.headers[VOUCHA_BOT_CHALLENGE_APP_ATTEST_ASSERTION_HEADER],
            ),
            challengeId: singleHeader(
              ctx.req.headers[VOUCHA_BOT_CHALLENGE_APP_ATTEST_CHALLENGE_ID_HEADER],
            ),
            keyId: singleHeader(ctx.req.headers[VOUCHA_BOT_CHALLENGE_APP_ATTEST_KEY_ID_HEADER]),
          }
        : null,
    },
  )
}

export function isBotChallengeRequiredError(error: unknown): error is BotChallengeRequiredError {
  return (
    error instanceof Error &&
    'status' in error &&
    error.status === 403 &&
    'code' in error &&
    error.code === BOT_CHALLENGE_REQUIRED &&
    'action' in error &&
    error.action === BOT_CHALLENGE_ACTION_TAG
  )
}

function createBotChallengeRequiredError(): BotChallengeRequiredError {
  return Object.assign(createHttpError(403, 'Bot challenge required'), {
    action: BOT_CHALLENGE_ACTION_TAG,
    code: BOT_CHALLENGE_REQUIRED,
  }) as BotChallengeRequiredError
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}
