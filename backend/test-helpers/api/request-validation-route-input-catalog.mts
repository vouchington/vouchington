import { loadRegisteredRouteCatalog } from '../api-fixtures/backend-contract-catalog.mts'
import { loadBackendProgram } from '../api-fixtures/backend-program.mts'
import { discoverSourceInputOperationsForProgram } from './request-validation-route-input.mts'

/** Finds request input consumed by the registered handler, excluding sibling routes in a module. */
export function discoverSourceInputOperations(): Set<string> {
  const backend = loadBackendProgram()
  return discoverSourceInputOperationsForProgram(
    backend.program,
    backend.routeFiles,
    loadRegisteredRouteCatalog(),
  )
}

export function discoverSourceQueryReads(): Map<string, Set<string>> {
  const backend = loadBackendProgram()
  const reads = new Map<string, Set<string>>()
  discoverSourceInputOperationsForProgram(
    backend.program,
    backend.routeFiles,
    loadRegisteredRouteCatalog(),
    reads,
  )
  return reads
}
