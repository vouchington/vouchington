import {
  BLOCKED_EXTERNAL_NETWORK_RULES,
  blockedExternalRequestFailureAllowlist,
  type BlockedExternalNetworkRule,
  type BrowserTestOptions,
} from 'vouchington-tooling/playwright'

const NOOP_ANALYTICS_SCRIPT = [
  'window.dataLayer = window.dataLayer || [];',
  'window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };',
].join('\n')

const rules: BlockedExternalNetworkRule[] = [
  {
    pattern: /^https:\/\/g\.voucha\.ai\/gtm\.js(?:[?#].*)?$/,
    reason: 'GTM proxy script is external telemetry and should not affect Playwright determinism',
    response: {
      body: NOOP_ANALYTICS_SCRIPT,
      contentType: 'application/javascript',
      status: 200,
    },
  },
  ...BLOCKED_EXTERNAL_NETWORK_RULES,
]

export const browserTestOptions = {
  rules,
  allowlist: blockedExternalRequestFailureAllowlist(
    [
      {
        // In local dev the image lambda runs on a separate port (IMAGE_LAMBDA_PORT), making image
        // requests cross-origin from the dev server. When the lambda cannot access S3 (e.g. missing
        // credentials) it returns a JSON error body, which Chrome's ORB blocks for "image" resource
        // requests. This only occurs locally; CI has proper S3 credentials.
        pattern: /localhost:\d+\/images\//,
        reason:
          'Local image lambda ORB blocks when S3 is inaccessible in local dev; does not occur in CI',
        type: 'requestfailed',
      },
    ],
    rules,
  ),
} satisfies BrowserTestOptions
