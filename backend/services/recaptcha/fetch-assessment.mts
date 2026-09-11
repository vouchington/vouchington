import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { readOptionalConfigEnv } from '@voucha/config/env'

// Result of a reCAPTCHA Enterprise assessment, normalised to the few fields we act on.
export type RecaptchaAssessment = {
  // riskAnalysis.score in [0, 1]; null when Google could not produce a score (e.g. invalid token).
  score: number | null
  // tokenProperties.action — the action the client claimed when generating the token.
  action: string | null
  // tokenProperties.valid — false when the token is malformed, expired, or already consumed.
  valid: boolean
  // riskAnalysis.reasons — coarse explanations such as AUTOMATION, UNEXPECTED_USAGE_PATTERNS.
  reasons: string[]
}

// Thrown only on HTTP 429 so assess.mts can engage the daily lockout. Every other failure surfaces
// as a generic Error and is handled fail-open.
export class RecaptchaRateLimitError extends Error {
  override name = 'RecaptchaRateLimitError'
}

function getProjectId(): string | undefined {
  return readOptionalConfigEnv('GOOGLE_RECAPTCHA_PROJECT_ID') || undefined
}

function getApiKey(): string | undefined {
  return readOptionalConfigEnv('GOOGLE_RECAPTCHA_API_KEY') || undefined
}

function getSiteKey(): string | undefined {
  return readOptionalConfigEnv('GOOGLE_RECAPTCHA_SITE_KEY') || undefined
}

// The assessment requires a GCP project, an API key, and the public site key. Without all three we
// skip the call entirely (assess.mts fails open) rather than issuing a request that cannot succeed.
export function hasRecaptchaCredentials(): boolean {
  return Boolean(getProjectId() && getApiKey() && getSiteKey())
}

/* no-mistakes: integration=recaptcha */
export async function fetchRecaptchaAssessment(
  token: string,
  expectedAction: string,
  ip: string | undefined,
): Promise<RecaptchaAssessment> {
  const projectId = getProjectId()
  const apiKey = getApiKey()
  const siteKey = getSiteKey()
  if (!projectId || !apiKey || !siteKey) {
    throw new Error('reCAPTCHA credentials are not configured')
  }

  const event: Record<string, unknown> = { token, siteKey, expectedAction }
  if (ip) event.userIpAddress = ip

  const response = await fetch(
    `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`,
    {
      dispatcher: getExternalRequestDispatcher(),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
      signal: AbortSignal.timeout(5000),
    },
  ).catch(error => {
    throw new Error('reCAPTCHA assessment request failed', { cause: error })
  })

  if (response.status === 429) {
    await response.body?.cancel()
    throw new RecaptchaRateLimitError('reCAPTCHA assessment rate limited (HTTP 429)')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`reCAPTCHA assessment returned HTTP ${response.status}`)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    throw new Error('reCAPTCHA assessment returned invalid JSON', { cause: error })
  }
  return parseAssessment(data)
}

function parseAssessment(data: unknown): RecaptchaAssessment {
  const root = (data ?? {}) as Record<string, unknown>
  const tokenProperties = (root.tokenProperties ?? {}) as Record<string, unknown>
  const riskAnalysis = (root.riskAnalysis ?? {}) as Record<string, unknown>
  return {
    valid: tokenProperties.valid === true,
    action: typeof tokenProperties.action === 'string' ? tokenProperties.action : null,
    score: typeof riskAnalysis.score === 'number' ? riskAnalysis.score : null,
    reasons: Array.isArray(riskAnalysis.reasons)
      ? riskAnalysis.reasons.filter((reason): reason is string => typeof reason === 'string')
      : [],
  }
}
