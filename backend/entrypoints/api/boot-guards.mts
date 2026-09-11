import { isDeployedEnvironment } from '@ts-shared/deploy-environment'

// Pure, parameterized predicates for serve.mts's fatal boot guards. serve.mts itself cannot be
// imported in a test (importing it starts a real HTTP server and registers process-exit
// side effects), so its own test file only asserts on source text. These predicates are the
// empirically-testable core of that logic: exercise them directly with ENVIRONMENT='staging' to
// prove the guards still fire on a deployed-but-not-production environment, not only on
// ENVIRONMENT='production'.

/**
 * True when a deployed (staging or production) process is about to boot with a Cloudflare
 * Turnstile *test* secret (always-pass, always-fail, token-already-spent) instead of a real one.
 */
export function shouldRejectTurnstileTestSecret(
  turnstileSecretKey: string,
  testSecretKeys: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDeployedEnvironment(env) && testSecretKeys.includes(turnstileSecretKey)
}

/**
 * True when a deployed (staging or production) process is about to boot with
 * SKIP_CAPTCHA_VERIFICATION=true, which would let bots bypass CAPTCHA on every protected
 * endpoint.
 */
export function shouldRejectSkipCaptchaVerification(env: NodeJS.ProcessEnv = process.env): boolean {
  return isDeployedEnvironment(env) && env.SKIP_CAPTCHA_VERIFICATION === 'true'
}
