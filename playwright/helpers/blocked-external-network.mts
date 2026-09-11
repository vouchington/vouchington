import type { BrowserContext, Route } from '@playwright/test'
import type { BrowserIssueAllowlistEntry } from './browser-errors.mts'

const NOOP_ANALYTICS_SCRIPT = [
  'window.dataLayer = window.dataLayer || [];',
  'window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };',
].join('\n')

interface BlockedExternalNetworkRule {
  pattern: RegExp
  reason: string
  response: Parameters<Route['fulfill']>[0]
}

export const BLOCKED_EXTERNAL_NETWORK_RULES: BlockedExternalNetworkRule[] = [
  {
    pattern: /^https:\/\/g\.voucha\.ai\/gtm\.js(?:[?#].*)?$/,
    reason: 'GTM proxy script is external telemetry and should not affect Playwright determinism',
    response: {
      body: NOOP_ANALYTICS_SCRIPT,
      contentType: 'application/javascript',
      status: 200,
    },
  },
  {
    pattern: /^https:\/\/www\.googletagmanager\.com\/(?:gtm\.js|gtag\/js)(?:[?#].*)?$/,
    reason: 'Google Tag Manager is external telemetry and should not affect Playwright determinism',
    response: {
      body: NOOP_ANALYTICS_SCRIPT,
      contentType: 'application/javascript',
      status: 200,
    },
  },
  {
    pattern:
      /^https:\/\/(?:www\.)?google-analytics\.com\/(?:collect|g\/collect|j\/collect|mp\/collect)(?:[?#].*)?$/,
    reason:
      'Google Analytics collection is external telemetry and should not affect Playwright determinism',
    response: {
      body: '',
      contentType: 'text/plain',
      status: 204,
    },
  },
  {
    pattern: /^https:\/\/analytics\.google\.com\/.*$/,
    reason:
      'Google Analytics UI endpoints are external telemetry and should not affect Playwright determinism',
    response: {
      body: '',
      contentType: 'text/plain',
      status: 204,
    },
  },
  {
    pattern: /^https:\/\/stats\.g\.doubleclick\.net\/.*$/,
    reason:
      'DoubleClick analytics requests are external telemetry and should not affect Playwright determinism',
    response: {
      body: '',
      contentType: 'text/plain',
      status: 204,
    },
  },
]

export const BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST: BrowserIssueAllowlistEntry[] = [
  ...BLOCKED_EXTERNAL_NETWORK_RULES.map(rule => ({
    pattern: rule.pattern,
    reason: rule.reason,
    type: 'requestfailed' as const,
  })),
  {
    // In local dev the image lambda runs on a separate port (IMAGE_LAMBDA_PORT), making image
    // requests cross-origin from the dev server. When the lambda cannot access S3 (e.g. missing
    // credentials) it returns a JSON error body, which Chrome's ORB blocks for "image" resource
    // requests. This only occurs locally; CI has proper S3 credentials.
    pattern: /localhost:\d+\/images\//,
    reason:
      'Local image lambda ORB blocks when S3 is inaccessible in local dev; does not occur in CI',
    type: 'requestfailed' as const,
  },
]

export function isBlockedExternalNetworkUrl(url: string) {
  return BLOCKED_EXTERNAL_NETWORK_RULES.some(rule => {
    rule.pattern.lastIndex = 0
    return rule.pattern.test(url)
  })
}

export async function installBlockedExternalNetwork(context: BrowserContext) {
  await Promise.all(
    BLOCKED_EXTERNAL_NETWORK_RULES.map(rule =>
      context.route(rule.pattern, route => route.fulfill(rule.response)),
    ),
  )
}
