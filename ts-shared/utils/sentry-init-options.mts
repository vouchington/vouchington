// The /browser entry builds the same options without the root export's Node-only coded-error
// classes, which keeps `http-errors` out of the client bundle.
import {
  initBrowserSentry,
  type CreateSentryInitOptionsInput,
  type SentryInitOptions,
} from '@vouchington/sentry/browser'
import {
  getSentryDsnConfig,
  resolveSentryEnablement,
  warnSentryConfigurationInvalidOnce,
} from './sentry-deployment-gate.mts'
import { SENTRY_SCRUB_OPTIONS } from './sentry-scrub-options.mts'

type VouchaSentryInitInput = Omit<
  CreateSentryInitOptionsInput,
  'enabledEnvironments' | 'onMisconfigured' | 'scrub'
>

// Every Sentry init site injects the same product policy: the fail-closed deployed-environment
// gate, a strictly validated DSN, and the Voucha credential and URL scrubbing options.
export function createVouchaSentryInitOptions(input: VouchaSentryInitInput): SentryInitOptions {
  const { enabled, environment } = resolveSentryEnablement({ environment: input.environment })
  // Each site calls its own SDK's init with the returned options, so this init is a no-op.
  return initBrowserSentry(
    { init: () => undefined },
    {
      ...input,
      dsn: getSentryDsnConfig(input.dsn)?.dsn,
      enabledEnvironments: enabled && environment ? [environment] : [],
      scrub: SENTRY_SCRUB_OPTIONS,
      onMisconfigured: warnSentryConfigurationInvalidOnce,
    },
  )
}
