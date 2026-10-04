import type ts from 'typescript'

import { loadRegisteredRouteCatalog } from '../api-fixtures/backend-contract-catalog.mts'
import { loadBackendProgram } from '../api-fixtures/backend-program.mts'
import { discoverSourceInputOperationsForProgram } from './request-validation-route-input.mts'

/** Finds request input consumed by the registered handler, excluding sibling routes in a module. */
export function discoverSourceInputOperations(): Set<string> {
  const backend = loadBackendProgram()
  return discoverSourceInputOperationsForProgram(
    backend.program,
    backend.apiSourceFiles,
    loadRegisteredRouteCatalog(),
  )
}

export function discoverSourceQueryReads(): Map<string, Set<string>> {
  return discoverSourceQueryInput().reads
}

export function discoverSourceQueryInput(): {
  reads: Map<string, Set<string>>
  sites: Map<string, ts.Node[]>
} {
  const backend = loadBackendProgram()
  const reads = new Map<string, Set<string>>()
  const sites = new Map<string, ts.Node[]>()
  discoverSourceInputOperationsForProgram(
    backend.program,
    backend.apiSourceFiles,
    loadRegisteredRouteCatalog(),
    reads,
    sites,
  )
  return { reads, sites }
}
