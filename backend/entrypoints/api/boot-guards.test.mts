import { describe, expect, it } from 'vitest'
import {
  shouldRejectSkipCaptchaVerification,
  shouldRejectTurnstileTestSecret,
} from './boot-guards.mts'

const TEST_SECRET_KEYS = ['test-always-pass', 'test-always-fail', 'test-token-already-spent']

describe('shouldRejectTurnstileTestSecret', () => {
  it('rejects a test secret on staging — NODE_ENV=production alone must not be required', () => {
    // This is the exact bug the deploy-environment flip fixes: ECS sets NODE_ENV=production on
    // every task, staging included, so a guard gated on NODE_ENV=production would have silently
    // let staging boot with a Turnstile test secret. ENVIRONMENT=staging must be sufficient.
    expect(
      shouldRejectTurnstileTestSecret('test-always-pass', TEST_SECRET_KEYS, {
        ENVIRONMENT: 'staging',
        NODE_ENV: 'production',
      }),
    ).toBe(true)
  })

  it('rejects a test secret on production', () => {
    expect(
      shouldRejectTurnstileTestSecret('test-always-pass', TEST_SECRET_KEYS, {
        ENVIRONMENT: 'production',
        NODE_ENV: 'production',
      }),
    ).toBe(true)
  })

  it('allows a real secret on staging and production', () => {
    expect(
      shouldRejectTurnstileTestSecret('a-real-secret-key', TEST_SECRET_KEYS, {
        ENVIRONMENT: 'staging',
        NODE_ENV: 'production',
      }),
    ).toBe(false)
    expect(
      shouldRejectTurnstileTestSecret('a-real-secret-key', TEST_SECRET_KEYS, {
        ENVIRONMENT: 'production',
        NODE_ENV: 'production',
      }),
    ).toBe(false)
  })

  it('allows a test secret outside a deployed environment (dev/test)', () => {
    expect(
      shouldRejectTurnstileTestSecret('test-always-pass', TEST_SECRET_KEYS, {
        NODE_ENV: 'test',
      }),
    ).toBe(false)
    expect(shouldRejectTurnstileTestSecret('test-always-pass', TEST_SECRET_KEYS, {})).toBe(false)
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
