// Fail-closed Sentry gating: reports only from an explicit allowlist of deployed
// environments. Anything else — test, development, CI, unset, unrecognized — stays silent.
export type SentryDeployedEnvironment = 'staging' | 'production'

const DEPLOYED_ENVIRONMENTS: ReadonlySet<string> = new Set<SentryDeployedEnvironment>([
  'staging',
  'production',
])

export interface ResolveSentryEnablementInput {
  environment: string | undefined
  otelEnabled: boolean
}

export interface SentryEnablement {
  enabled: boolean
  environment: string | undefined
  otelOnly: boolean
}

export function resolveSentryEnablement({
  environment,
  otelEnabled,
}: ResolveSentryEnablementInput): SentryEnablement {
  const isDeployedEnvironment =
    environment !== undefined && DEPLOYED_ENVIRONMENTS.has(environment.toLowerCase())
  const otelOnly = otelEnabled && !isDeployedEnvironment
  return { enabled: isDeployedEnvironment || otelOnly, environment, otelOnly }
}
