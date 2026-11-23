import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import type { PrivateUser } from '@services/users/types'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import { type RecaptchaConfig, getRecaptchaConfig } from './config.mts'
import type { RecaptchaAssessmentResult } from '@vouchington/utils/recaptcha-enterprise'
import {
  type RecaptchaCredentials,
  fetchRecaptchaAssessment,
  getRecaptchaCredentials,
} from './fetch-assessment.mts'
import { isHighTrustUser } from './authorization.mts'
import { isRecaptchaLockedOut, setRecaptchaLockedOutBackground } from './rate-limit-lockout.mts'

// reCAPTCHA actions are sent by the client and echoed back by Google so we can confirm the token
// was generated for the action we expected. Posts and comments share the POST /posts endpoint, so
// the route derives which one applies from the presence of a parent post.
export type RecaptchaAction = 'create_post' | 'create_comment'

type AssessRecaptchaInput = {
  currentUser: PrivateUser
  token: string | undefined
  expectedAction: RecaptchaAction
  ip: string | undefined
  dependencies?: Partial<AssessRecaptchaDependencies>
}

type AssessRecaptchaDependencies = {
  getRecaptchaConfig: () => RecaptchaConfig
  getRecaptchaCredentials: () => RecaptchaCredentials | undefined
  isRecaptchaLockedOut: () => Promise<boolean>
  fetchRecaptchaAssessment: (
    credentials: RecaptchaCredentials,
    token: string,
    expectedAction: string,
    ip: string | undefined,
  ) => Promise<RecaptchaAssessmentResult>
  setRecaptchaLockedOutBackground: () => void
}

const defaultDependencies: AssessRecaptchaDependencies = {
  getRecaptchaConfig,
  getRecaptchaCredentials,
  isRecaptchaLockedOut,
  fetchRecaptchaAssessment,
  setRecaptchaLockedOutBackground,
}

const resolveDependencies = (
  overrides: Partial<AssessRecaptchaDependencies> | undefined,
): AssessRecaptchaDependencies => mergeDefinedDependencies(defaultDependencies, overrides)

// Deliberately generic: when blocking is enabled we never reveal that a reCAPTCHA score caused the
// rejection (the real reason is logged to Sentry instead, per #4445).
const RECAPTCHA_BLOCK_MESSAGE = 'Unable to submit your request right now. Please try again.'

/**
 * Runs a reCAPTCHA Enterprise assessment as the **last** anti-abuse check on a content-creation
 * request (after auth, authorization, rate limits, honeypot, and Turnstile). It is monitor-only by
 * default: low scores are always logged to Sentry, and a request is only rejected when blocking is
 * explicitly enabled in DynamicConfig. Every failure path fails open — reCAPTCHA must never break
 * content creation.
 */
export async function assessRecaptchaToken({
  currentUser,
  token,
  expectedAction,
  ip,
  dependencies: dependencyOverrides,
}: AssessRecaptchaInput): Promise<void> {
  const dependencies = resolveDependencies(dependencyOverrides)
  const config = dependencies.getRecaptchaConfig()
  if (!config.enabled) return
  // Never call the paid assessment API outside staging/production. This also keeps dev and test
  // runs from making real network calls.
  if (!isDeployedEnvironment()) return
  const credentials = dependencies.getRecaptchaCredentials()
  if (!credentials) return
  if (isHighTrustUser(currentUser)) return
  // A score is impossible without a client token; in monitor mode we simply skip rather than block.
  if (!token) return
  if (await dependencies.isRecaptchaLockedOut()) return

  const assessment = await dependencies.fetchRecaptchaAssessment(
    credentials,
    token,
    expectedAction,
    ip,
  )
  if (assessment.status === 'error') {
    // Stop spending assessments for the rest of the day, then fail open for this request.
    if (assessment.failure.kind === 'rate-limited') dependencies.setRecaptchaLockedOutBackground()
    onError(new Error(assessment.failure.message, { cause: assessment.failure.cause }))
    return
  }

  // An invalid token means Google could not evaluate the request. We log it for visibility but
  // fail open — blocking is strictly score-based.
  if (assessment.status === 'invalid-token') {
    onError(buildLowScoreReport(currentUser, expectedAction, { ...assessment, score: null }))
    return
  }

  if (assessment.score >= config.block_threshold) return

  // Below the threshold: always log the real signal to Sentry...
  onError(buildLowScoreReport(currentUser, expectedAction, assessment))
  // ...and only reject when blocking is enabled, with a message that never mentions reCAPTCHA.
  if (config.blocking_enabled) {
    throw createHttpError(400, RECAPTCHA_BLOCK_MESSAGE, {
      cause: new Error(
        `reCAPTCHA score ${assessment.score} below threshold ${config.block_threshold} for ${expectedAction}`,
      ),
    })
  }
}

type ReportableError = Error & {
  tags?: Record<string, string | number | boolean>
  extra?: Record<string, unknown>
}

type ReportedAssessment =
  | Extract<RecaptchaAssessmentResult, { status: 'assessed' }>
  | (Extract<RecaptchaAssessmentResult, { status: 'invalid-token' }> & { score: null })

function buildLowScoreReport(
  currentUser: PrivateUser,
  expectedAction: RecaptchaAction,
  assessment: ReportedAssessment,
): ReportableError {
  const valid = assessment.status === 'assessed'
  const error: ReportableError = new Error(
    `reCAPTCHA low-trust signal for ${expectedAction} (score=${assessment.score ?? 'null'}, valid=${valid})`,
  )
  error.tags = { integration: 'recaptcha', expected_action: expectedAction }
  error.extra = {
    user_id: currentUser.id,
    expected_action: expectedAction,
    returned_action: assessment.action,
    action_mismatch: assessment.action !== null && assessment.action !== expectedAction,
    score: assessment.score,
    valid,
    invalid_reason: valid ? null : assessment.invalidReason,
    reasons: valid ? assessment.reasons : [],
  }
  return error
}

function mergeDefinedDependencies<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T> | undefined,
): T {
  if (!overrides) return { ...defaults }

  const merged = { ...defaults }
  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const value = overrides[key]
    if (value === undefined) continue
    merged[key] = value as T[keyof T]
  }
  return merged
}
