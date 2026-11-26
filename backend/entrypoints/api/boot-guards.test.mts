import { assertBackendSessionJwtConfiguration } from '@services/jwt-session/configuration'
import { isTurnstileTestSecretKey } from '@services/captcha/secret-keys'
import { describe, expect, it } from 'vitest'
import {
  shouldRejectSkipCaptchaVerification,
  shouldRejectPlaywrightTest,
  shouldRejectTurnstileTestSecret,
} from './boot-guards.mts'

// Cloudflare's always-pass test secret.
const ALWAYS_PASS_TEST_SECRET = '1x0000000000000000000000000000000AA'

describe('shouldRejectTurnstileTestSecret', () => {
  it('rejects a test secret on staging — NODE_ENV=production alone must not be required', () => {
    // This is the exact bug the deploy-environment flip fixes: ECS sets NODE_ENV=production on
    // every task, staging included, so a guard gated on NODE_ENV=production would have silently
    // let staging boot with a Turnstile test secret. ENVIRONMENT=staging must be sufficient.
    expect(
      shouldRejectTurnstileTestSecret(ALWAYS_PASS_TEST_SECRET, isTurnstileTestSecretKey, {
        ENVIRONMENT: 'staging',
        NODE_ENV: 'production',
      }),
    ).toBe(true)
  })

  it.each([
    ALWAYS_PASS_TEST_SECRET,
    '2x0000000000000000000000000000000AA',
    '3x0000000000000000000000000000000AA',
  ])('rejects the Cloudflare test secret %s on production', secret => {
    expect(
      shouldRejectTurnstileTestSecret(secret, isTurnstileTestSecretKey, {
        ENVIRONMENT: 'production',
        NODE_ENV: 'production',
      }),
    ).toBe(true)
  })

  it('allows a real secret on staging and production', () => {
    expect(
      shouldRejectTurnstileTestSecret('a-real-secret-key', isTurnstileTestSecretKey, {
        ENVIRONMENT: 'staging',
        NODE_ENV: 'production',
      }),
    ).toBe(false)
    expect(
      shouldRejectTurnstileTestSecret('a-real-secret-key', isTurnstileTestSecretKey, {
        ENVIRONMENT: 'production',
        NODE_ENV: 'production',
      }),
    ).toBe(false)
  })

  it('allows a test secret outside a deployed environment (dev/test)', () => {
    expect(
      shouldRejectTurnstileTestSecret(ALWAYS_PASS_TEST_SECRET, isTurnstileTestSecretKey, {
        NODE_ENV: 'test',
      }),
    ).toBe(false)
    expect(
      shouldRejectTurnstileTestSecret(ALWAYS_PASS_TEST_SECRET, isTurnstileTestSecretKey, {}),
    ).toBe(false)
  })
})

describe('shouldRejectSkipCaptchaVerification', () => {
  it('rejects SKIP_CAPTCHA_VERIFICATION=true on staging — not just production', () => {
    expect(
      shouldRejectSkipCaptchaVerification({
        ENVIRONMENT: 'staging',
        NODE_ENV: 'production',
        SKIP_CAPTCHA_VERIFICATION: 'true',
      }),
    ).toBe(true)
  })

  it('rejects SKIP_CAPTCHA_VERIFICATION=true on production', () => {
    expect(
      shouldRejectSkipCaptchaVerification({
        ENVIRONMENT: 'production',
        NODE_ENV: 'production',
        SKIP_CAPTCHA_VERIFICATION: 'true',
      }),
    ).toBe(true)
  })

  it('allows SKIP_CAPTCHA_VERIFICATION=true outside a deployed environment', () => {
    expect(
      shouldRejectSkipCaptchaVerification({
        NODE_ENV: 'test',
        SKIP_CAPTCHA_VERIFICATION: 'true',
      }),
    ).toBe(false)
  })

  it('allows a deployed environment when SKIP_CAPTCHA_VERIFICATION is unset', () => {
    expect(shouldRejectSkipCaptchaVerification({ ENVIRONMENT: 'staging' })).toBe(false)
    expect(shouldRejectSkipCaptchaVerification({ ENVIRONMENT: 'production' })).toBe(false)
  })
})

describe('deployed Playwright bypass guard', () => {
  it('refuses test bypasses in staging and production', () => {
    for (const ENVIRONMENT of ['staging', 'production']) {
      expect(
        shouldRejectPlaywrightTest({ ENVIRONMENT, NODE_ENV: 'test', PLAYWRIGHT_TEST: 'true' }),
      ).toBe(true)
      expect(shouldRejectPlaywrightTest({ ENVIRONMENT, PLAYWRIGHT_TEST: 'false' })).toBe(false)
    }
    expect(shouldRejectPlaywrightTest({ NODE_ENV: 'test', PLAYWRIGHT_TEST: 'true' })).toBe(false)
  })
})

describe('deployed API session key configuration', () => {
  it('rejects missing signing keys before deployed API startup', async () => {
    await expect(
      assertBackendSessionJwtConfiguration({
        ENVIRONMENT: 'staging',
        NODE_ENV: 'test',
        VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
      }),
    ).rejects.toThrow('must be configured')
  })
})
