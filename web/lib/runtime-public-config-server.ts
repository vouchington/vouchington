import 'server-only'

import {
  DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
  parseFeatureFlagCookieMaxLength,
} from '@ts-shared/feature-flags'
import { getSentryDsnConfig } from '@ts-shared/utils/sentry-deployment-gate'
import { TURNSTILE_TEST_SITE_KEY, TURNSTILE_TEST_SITE_KEYS } from './turnstile-config'
import { escapeInlineScriptJson } from './utils/inline-script-json'
import {
  RUNTIME_PUBLIC_CONFIG_READY_EVENT,
  type RuntimePublicConfig,
} from './runtime-public-config'

type RuntimeEnv = Record<string, string | undefined>

type RuntimePublicConfigOptions = {
  allowTurnstileTestKey?: boolean
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (trimmed === 'PLACEHOLDER') return undefined
  return trimmed ? trimmed : undefined
}

function firstClean(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }
  return undefined
}

export function getServerRuntimePublicConfig(
  env: RuntimeEnv = process.env,
  options: RuntimePublicConfigOptions = {},
): RuntimePublicConfig {
  return {
    appleClientId: firstClean(env.NEXT_PUBLIC_APPLE_CLIENT_ID, env.APPLE_CLIENT_ID),
    environment: clean(env.ENVIRONMENT),
    facebookAppId: firstClean(env.NEXT_PUBLIC_FACEBOOK_APP_ID, env.FACEBOOK_APP_ID),
    featureFlagCookieMaxLength: parseFeatureFlagCookieMaxLength(
      firstClean(
        env.NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH,
        env.FEATURE_FLAG_COOKIE_MAX_LENGTH,
      ),
      DEFAULT_FEATURE_FLAG_COOKIE_MAX_LENGTH,
    ),
    githubClientId: firstClean(env.NEXT_PUBLIC_GITHUB_CLIENT_ID, env.GITHUB_CLIENT_ID),
    googleClientId: firstClean(env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_ID),
    gtmId: firstClean(env.NEXT_PUBLIC_GTM_ID, env.GTM_ID),
    linkedinClientId: firstClean(env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID, env.LINKEDIN_CLIENT_ID),
    microsoftClientId: firstClean(env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_ID),
    microsoftTenantId: firstClean(env.NEXT_PUBLIC_MICROSOFT_TENANT_ID, env.MICROSOFT_TENANT_ID),
    recaptchaSiteKey: firstClean(
      env.NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY,
      env.GOOGLE_RECAPTCHA_SITE_KEY,
    ),
    sentryDsn: getSentryDsnConfig(env.SENTRY_WEB_DSN)?.dsn,
    // Local/dev may expose the bare server-side Turnstile secret, but the browser site key must
    // come from the explicit runtime-public variable; otherwise the server secret could leak.
    turnstileSiteKey:
      firstClean(env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY) ??
      (options.allowTurnstileTestKey ? TURNSTILE_TEST_SITE_KEY : undefined),
    webPushPublicKey: firstClean(env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY, env.WEB_PUSH_PUBLIC_KEY),
    xClientId: firstClean(env.NEXT_PUBLIC_X_CLIENT_ID, env.X_CLIENT_ID),
  }
}

// Local, ENVIRONMENT-only check — deliberately not `@ts-shared/deploy-environment`'s
// `isDeployedEnvironment()`, whose NODE_ENV=production fallback exists for backend processes
// where that fallback is a rare, deliberate signal. Here it would misfire: a developer running
// `next build && next start` locally gets NODE_ENV=production automatically from Next.js on every
// production build, with no ENVIRONMENT set. ENVIRONMENT is the only signal that distinguishes a
// real deployed target from a local production build (see ecs-web.tf).
function isDeployedByEnvironment(env: RuntimeEnv): boolean {
  const environment = env.ENVIRONMENT?.trim()
  return environment === 'staging' || environment === 'production'
}

export function assertRuntimePublicConfig(
  config: RuntimePublicConfig,
  env: RuntimeEnv = process.env,
): void {
  if (!isDeployedByEnvironment(env) || env.ALLOW_TURNSTILE_TEST_KEY === 'true') return

  const siteKey = config.turnstileSiteKey?.trim()
  if (!siteKey) {
    throw new Error(
      'FATAL: NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY must be set for production runtime. ' +
        'CI/test runtimes: set ALLOW_TURNSTILE_TEST_KEY=true. Production deploys: set a real Turnstile site key.',
    )
  }
  if (TURNSTILE_TEST_SITE_KEYS.includes(siteKey)) {
    throw new Error(
      'FATAL: NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY is a public Cloudflare test site key ' +
        '(always-pass, always-fail, or force-interactive), which would let a deployed frontend ' +
        'send non-production tokens that the production backend rejects. Set a real Turnstile site key.',
    )
  }
}

export function serializeRuntimePublicConfigBootstrapScript(config: RuntimePublicConfig): string {
  const serializedConfig = escapeInlineScriptJson(JSON.stringify(config))
  return `window.__VOUCHA_PUBLIC_CONFIG__=${serializedConfig};window.dispatchEvent(new Event(${JSON.stringify(RUNTIME_PUBLIC_CONFIG_READY_EVENT)}))`
}
