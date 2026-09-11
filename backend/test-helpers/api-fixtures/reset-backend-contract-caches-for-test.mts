import { resetBackendProgramCacheForTest } from './backend-program.mts'
import { resetBackendQueryContractCacheForTest } from './query-contract-registry.mts'
import { resetRegisteredRouteCatalogCacheForTest } from './registered-route-catalog.mts'
import { resetBackendRequestContractCacheForTest } from './request-contract-registry.mts'
import { resetBackendResponseContractCacheForTest } from './response-contract-registry.mts'

export function resetBackendContractDiscoveryCachesForTest(): void {
  resetBackendResponseContractCacheForTest()
  resetBackendRequestContractCacheForTest()
  resetBackendQueryContractCacheForTest()
  resetRegisteredRouteCatalogCacheForTest()
  resetBackendProgramCacheForTest()
}
