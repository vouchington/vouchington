import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist'

export type ProcessorJobs =
  | 'processBlacklistDispatcher'
  | 'processBlacklistSourceSync'
  | 'drainHostnameCacheInvalidationWork'

export type BlacklistDispatcherData = Record<string, never>

export type BlacklistSourceSyncData = {
  sourceId: DomainBlacklistSourceId
}
