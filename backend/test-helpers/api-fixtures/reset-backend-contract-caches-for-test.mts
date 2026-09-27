import { resetBackendContractCatalogForTest } from './backend-contract-catalog.mts'
import { resetBackendProgramCacheForTest } from './backend-program.mts'

export function resetBackendContractDiscoveryCachesForTest(): void {
  resetBackendContractCatalogForTest()
  resetBackendProgramCacheForTest()
}
