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

export interface SentryDsnConfig {
  dsn: string
  envelopeUrl: string
  origin: string
  projectId: string
}

export interface ResolveSentryDsnEnablementInput extends ResolveSentryEnablementInput {
  dsn: string | undefined
}

export interface SentryDsnEnablement extends SentryEnablement {
  configurationInvalid: boolean
  sentryDsn: SentryDsnConfig | undefined
}

// This message intentionally contains no configured value. It is emitted at most once by each
// runtime isolate when a deployed environment cannot initialize Sentry.
export const SENTRY_CONFIGURATION_WARNING =
  'Sentry is disabled because its required DSN configuration is missing or invalid.'

/**
 * Parse a Sentry DSN without coupling application code to a particular Sentry organization,
 * project, or ingest host. The returned URL is canonical so the Worker tunnel can compare an
 * envelope DSN against the configured values without accepting lookalike URL spellings.
 */
export function getSentryDsnConfig(raw: string | undefined): SentryDsnConfig | undefined {
  const value = raw?.trim()
  if (!value) return undefined

  try {
    const url = new URL(value)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const projectId = pathSegments.at(-1)
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      !url.username ||
      !/^[A-Za-z0-9_]+$/.test(url.username) ||
      url.password ||
      url.search ||
      url.hash ||
      !projectId ||
      !/^\d+$/.test(projectId)
    ) {
      return undefined
    }

    const prefix = pathSegments.slice(0, -1).join('/')
    const canonicalPath = `/${prefix ? `${prefix}/` : ''}${projectId}`
    if (url.pathname !== canonicalPath) return undefined
    return {
      dsn: url.toString(),
      envelopeUrl: new URL(
        `/${prefix ? `${prefix}/` : ''}api/${projectId}/envelope/`,
        url.origin,
      ).toString(),
      origin: url.origin,
      projectId,
    }
  } catch {
    return undefined
  }
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

export function resolveSentryDsnEnablement({
  dsn,
  environment,
  otelEnabled,
}: ResolveSentryDsnEnablementInput): SentryDsnEnablement {
  const enablement = resolveSentryEnablement({ environment, otelEnabled })
  if (enablement.otelOnly) {
    return { ...enablement, configurationInvalid: false, sentryDsn: undefined }
  }

  const sentryDsn = getSentryDsnConfig(dsn)
  return {
    ...enablement,
    enabled: enablement.enabled && Boolean(sentryDsn),
    configurationInvalid: enablement.enabled && !sentryDsn,
    sentryDsn,
  }
}
