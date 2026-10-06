import { createBackendContractCatalogLoader } from './backend-contract-catalog-loader.mts'
import { loadBackendProgram } from './backend-program.mts'

export type { RegisteredRoute } from 'vouchington-tooling/api-contract-discovery'
export type { BackendRequestContract } from './request-contract-types.mts'
export type { BackendResponseContract } from './response-contract-types.mts'

export const {
  loadBackendResponseContracts,
  loadBackendRequestContracts,
  loadBackendQueryContracts,
  loadBackendHeaderContracts,
  loadRegisteredRouteCatalog,
  loadBackendContractCatalog,
} = createBackendContractCatalogLoader(loadBackendProgram)
