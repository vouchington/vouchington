import type { Context } from '@jongleberry/api-server'
import createHttpError from 'http-errors'
import { getTrustedCloudflareBotScore } from '@modules/request-client-info/cloudflare-bot-score'
import { hasVerifiedSessionCredential } from '@modules/request-client-info/session-credential'
import { getOptionalRequestOrigin } from '@modules/request-client-info'
import { BOT_CHALLENGE_REQUIRED } from '@modules/on-error/error-codes'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import { getBotChallengeClearanceSeconds } from '@services/captcha/bot-challenge-config'
import {
  hasBotChallengeClearance,
  recordBotChallengeClearance,
} from '@services/captcha/bot-challenge-clearance'
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
  const origin = getOptionalRequestOrigin()
  if (origin && origin.credential !== 'session') return
  if (!hasVerifiedSessionCredential(ctx.req)) return
  const score = getTrustedCloudflareBotScore(ctx.req)
  if (score === undefined || score > LOW_BOT_SCORE_MAX) return
  if (!MUTATING_METHODS.has(ctx.req.method?.toUpperCase() ?? 'GET')) return

  const existing = verificationByRequest.get(ctx.req)
  if (existing) return existing
  const verification = verifyLowScoreProofOrClearance(ctx)
  verificationByRequest.set(ctx.req, verification)
  return verification
}

async function verifyLowScoreProofOrClearance(ctx: Context): Promise<void> {
  await ctx.verifyAttestedRequestSignature()
  const clearanceSeconds = getBotChallengeClearanceSeconds()
  const { sid } = await ctx.getSessionTokenData()
  const tokenHeader = ctx.req.headers[VOUCHA_BOT_CHALLENGE_TOKEN_HEADER]
  if (clearanceSeconds > 0 && tokenHeader === undefined && (await hasBotChallengeClearance(sid)))
    return

  const token = singleHeader(tokenHeader)
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
  if (clearanceSeconds > 0) await recordBotChallengeClearance(sid, clearanceSeconds)
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
