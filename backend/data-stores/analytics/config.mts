import { getDeployEnvironment, isDeployedEnvironment } from '@ts-shared/deploy-environment'

import type { AnalyticsTableName } from './tables.mts'

export type AnalyticsBackend = 'local' | 'firehose' | 'disabled'

const rawBackend = process.env.ANALYTICS_BACKEND ?? 'disabled'

export function parseAnalyticsBackend(
  raw: string,
  isDeployed: boolean = isDeployedEnvironment(),
): AnalyticsBackend {
  if (raw === 'local' || raw === 'firehose' || raw === 'disabled') return raw
  if (isDeployed) {
    throw new Error(`ANALYTICS_BACKEND must be 'local', 'firehose', or 'disabled' — got: '${raw}'`)
  }
  return 'disabled'
}

export const ANALYTICS_BACKEND: AnalyticsBackend = parseAnalyticsBackend(rawBackend)

const env = getDeployEnvironment()

export const ANALYTICS_LOCAL_DIR = process.env.ANALYTICS_LOCAL_DIR ?? './tmp/analytics'

export const ANALYTICS_FIREHOSE_PREFIX =
  process.env.ANALYTICS_FIREHOSE_PREFIX ?? `voucha-analytics-${env}-`

export function getAnalyticsFirehoseStreamName(table: AnalyticsTableName): string {
  return `${process.env.ANALYTICS_FIREHOSE_PREFIX ?? ANALYTICS_FIREHOSE_PREFIX}${table}`
}
