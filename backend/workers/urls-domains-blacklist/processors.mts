import { getAllBlacklistSources } from '@services/urls-domains-blacklist'
import { syncBlacklistSourceById } from '@services/urls-domains-blacklist-sync'
import { enqueueBulkSourceSyncs } from '@queues/urls-domains-blacklist/enqueues'
import type {
  BlacklistDispatcherData,
  BlacklistSourceSyncData,
} from '@queues/urls-domains-blacklist/types'

export const processBlacklistDispatcher = async (_data: BlacklistDispatcherData): Promise<void> => {
  const sources = await getAllBlacklistSources()

  const syncs = sources.map(
    source =>
      ({
        sourceId: source.id,
      }) satisfies BlacklistSourceSyncData,
  )

  await enqueueBulkSourceSyncs(syncs)
}

export const processBlacklistSourceSync = async (data: BlacklistSourceSyncData): Promise<void> => {
  await syncBlacklistSourceById(data.sourceId)
}
