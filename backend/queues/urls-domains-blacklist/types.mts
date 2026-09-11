import type { DomainBlacklistSourceId } from '@services/urls-domains-blacklist'

export type ProcessorJobs = 'processBlacklistDispatcher' | 'processBlacklistSourceSync'

export type BlacklistDispatcherData = Record<string, never>

export type BlacklistSourceSyncData = {
  sourceId: DomainBlacklistSourceId
}
