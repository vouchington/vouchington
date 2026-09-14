import { describe, expect, it } from 'vitest'
import {
  assertRuntimePublicConfig,
  getServerRuntimePublicConfig,
  serializeRuntimePublicConfigBootstrapScript,
} from './runtime-public-config-server'
import { TURNSTILE_TEST_SITE_KEY } from './turnstile-config'

describe('runtime public config server helpers', () => {
  it('exposes SENTRY_WEB_DSN only through the runtime public bootstrap config', () => {
    expect(
      getServerRuntimePublicConfig({ SENTRY_WEB_DSN: 'https://public@example.test/123' }),
    ).toMatchObject({ sentryDsn: 'https://public@example.test/123' })
    expect(
      getServerRuntimePublicConfig({ SENTRY_WEB_DSN: 'private-invalid-value' }).sentryDsn,
    ).toBe(undefined)
  })

  it('builds browser config from runtime env without requiring NEXT_PUBLIC names', () => {
    const config = getServerRuntimePublicConfig({
      ALLOW_TURNSTILE_TEST_KEY: 'true',
      APPLE_CLIENT_ID: 'apple-client-id',
      ENVIRONMENT: 'staging',
      FACEBOOK_APP_ID: 'facebook-app-id',
      FEATURE_FLAG_COOKIE_MAX_LENGTH: '2048',
      GITHUB_CLIENT_ID: 'github-client-id',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_RECAPTCHA_SITE_KEY: 'recaptcha-site-key',
      GTM_ID: 'GTM-TEST',
      LINKEDIN_CLIENT_ID: 'linkedin-client-id',
      MICROSOFT_CLIENT_ID: 'microsoft-client-id',
      MICROSOFT_TENANT_ID: 'organizations',
      WEB_PUSH_PUBLIC_KEY: 'web-push-public-key',
      X_CLIENT_ID: 'x-client-id',
    })

    expect(config).toMatchObject({
      appleClientId: 'apple-client-id',
      environment: 'staging',
      facebookAppId: 'facebook-app-id',
      featureFlagCookieMaxLength: 2048,
      githubClientId: 'github-client-id',
      googleClientId: 'google-client-id',
      gtmId: 'GTM-TEST',
      linkedinClientId: 'linkedin-client-id',
      microsoftClientId: 'microsoft-client-id',
      microsoftTenantId: 'organizations',
      recaptchaSiteKey: 'recaptcha-site-key',
      webPushPublicKey: 'web-push-public-key',
      xClientId: 'x-client-id',
    })
  })

  it('escapes the inline bootstrap JSON for script context', () => {
    expect(
      serializeRuntimePublicConfigBootstrapScript({
        googleClientId: 'google-client</script>',
      }),
    ).toBe(
      String.raw`window.__VOUCHA_PUBLIC_CONFIG__={"googleClientId":"google-client\u003c/script>"};window.dispatchEvent(new Event("voucha:runtime-public-config-ready"))`,
    )
  })

  it('ignores SSM placeholder values before serializing runtime public config', () => {
    const config = getServerRuntimePublicConfig(
      {
        NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY: 'PLACEHOLDER',
        NEXT_PUBLIC_GITHUB_CLIENT_ID: 'PLACEHOLDER',
        NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: 'PLACEHOLDER',
        NODE_ENV: 'production',
      },
      { allowTurnstileTestKey: true },
    )

    expect(config.githubClientId).toBeUndefined()
    expect(config.turnstileSiteKey).toBe(TURNSTILE_TEST_SITE_KEY)
    expect(config.webPushPublicKey).toBeUndefined()
    expect(() => assertRuntimePublicConfig(config, { ENVIRONMENT: 'production' })).toThrow(
      'public Cloudflare test site key',
    )
  })

  it('rejects missing or test Turnstile site keys in production runtime', () => {
    const config = getServerRuntimePublicConfig({ NODE_ENV: 'production' })
    const testKeyConfig = getServerRuntimePublicConfig(
      { NODE_ENV: 'production' },
      { allowTurnstileTestKey: true },
    )

    expect(() => assertRuntimePublicConfig(config, { ENVIRONMENT: 'production' })).toThrow(
      'must be set for production runtime',
    )
    expect(() => assertRuntimePublicConfig(testKeyConfig, { ENVIRONMENT: 'production' })).toThrow(
      'public Cloudflare test site key',
    )
    expect(() =>
      assertRuntimePublicConfig(testKeyConfig, {
        ALLOW_TURNSTILE_TEST_KEY: 'true',
        ENVIRONMENT: 'production',
      }),
    ).not.toThrow()
  })

  it('rejects missing Turnstile site keys on staging, where NODE_ENV is always "production"', () => {
    // ECS sets NODE_ENV="production" unconditionally on every task, staging included, and Next
    // inlines it to that literal in every deployed bundle regardless of target. ENVIRONMENT is the
    // only signal that actually distinguishes staging from a developer's local `next build`.
    const config = getServerRuntimePublicConfig({ ENVIRONMENT: 'staging' })

    expect(() => assertRuntimePublicConfig(config, { ENVIRONMENT: 'staging' })).toThrow(
      'must be set for production runtime',
    )
  })

  it('does not fire the fatal check for a local production build with no ENVIRONMENT set', () => {
    // A developer running `next build && next start` locally sets NODE_ENV=production but never
    // ENVIRONMENT — this must stay inert, matching non-deployed behavior.
    const config = getServerRuntimePublicConfig({ NODE_ENV: 'production' })

    expect(() => assertRuntimePublicConfig(config, { NODE_ENV: 'production' })).not.toThrow()
  })
})
