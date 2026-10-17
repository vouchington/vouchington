import {
  backgroundDataHandler,
  backgroundHandler,
} from '@queues/background/enqueues/define-handler'
import {
  URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB,
  URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB,
  URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB,
} from '@queues/background/enqueues/urls-domains-blacklist-jobs'
import {
  drainHostnameCacheInvalidationWork,
  processBlacklistDispatcher,
  processBlacklistSourceSync,
} from './processors.mts'

export const urlsDomainsBlacklistHandlers = [
  backgroundDataHandler(URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB, processBlacklistDispatcher),
  backgroundDataHandler(URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB, processBlacklistSourceSync),
  backgroundHandler(URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB, () =>
    drainHostnameCacheInvalidationWork(),
  ),
]
