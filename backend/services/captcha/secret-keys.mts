import { TURNSTILE_TEST_SECRET_KEYS } from '@vouchington/utils/turnstile-siteverify'

// Dev and test default to Cloudflare's always-pass secret so verification runs the real code path
// without real keys. Backend startup (backend/entrypoints/api/serve.mts) rejects every public
// Cloudflare test secret on a deployed environment.
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const turnstileTestSecretKeys: readonly string[] = Object.values(TURNSTILE_TEST_SECRET_KEYS)

export function getTurnstileSecretKey(): string {
  return (
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim() || TURNSTILE_TEST_SECRET_KEYS.alwaysPasses
  )
}

export function isTurnstileTestSecretKey(secret: string): boolean {
  return turnstileTestSecretKeys.includes(secret)
}
