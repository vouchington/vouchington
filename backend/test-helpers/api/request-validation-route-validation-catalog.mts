import type ts from 'typescript'

import { loadRegisteredRouteCatalog } from '../api-fixtures/backend-contract-catalog.mts'
import { loadBackendProgram } from '../api-fixtures/backend-program.mts'
import { discoverRuntimeValidatedOperationsForProgram } from './request-validation-route-coverage.mts'

export function discoverRuntimeValidatedOperations(
  carrierFamilies?: Map<string, Set<string>>,
  queryReadSites?: ReadonlyMap<string, readonly ts.Node[]>,
): Set<string> {
  const backend = loadBackendProgram()
  return discoverRuntimeValidatedOperationsForProgram(
    backend.program,
    backend.apiSourceFiles,
    loadRegisteredRouteCatalog(),
    { carrierFamilies, queryReadSites },
  )
}
