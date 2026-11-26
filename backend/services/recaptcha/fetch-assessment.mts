import { getExternalFetch } from '@modules/utils/http'
import { readOptionalConfigEnv } from '@voucha/config/env'
import {
  type RecaptchaAssessmentResult,
  assessRecaptchaToken as createRecaptchaAssessment,
} from '@vouchington/utils/recaptcha-enterprise'

export type RecaptchaCredentials = { projectId: string; apiKey: string; siteKey: string }

// The assessment requires a GCP project, an API key, and the public site key. Without all three we
// skip the call entirely (assess.mts fails open) rather than issuing a request that cannot succeed.
export function getRecaptchaCredentials(): RecaptchaCredentials | undefined {
  const projectId = readOptionalConfigEnv('GOOGLE_RECAPTCHA_PROJECT_ID')
  const apiKey = readOptionalConfigEnv('GOOGLE_RECAPTCHA_API_KEY')
  const siteKey = readOptionalConfigEnv('GOOGLE_RECAPTCHA_SITE_KEY')
  if (!projectId || !apiKey || !siteKey) return undefined
  return { projectId, apiKey, siteKey }
}

/* no-mistakes: integration=recaptcha */
export function fetchRecaptchaAssessment(
  credentials: RecaptchaCredentials,
  token: string,
  expectedAction: string,
  ip: string | undefined,
): Promise<RecaptchaAssessmentResult> {
  return createRecaptchaAssessment({
    ...credentials,
    fetch: getExternalFetch(),
    token,
    expectedAction,
    userIpAddress: ip,
  })
}
