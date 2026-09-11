import ts from 'typescript'

import { loadBackendProgram, type BackendProgramGeneration } from './backend-program.mts'
import { contractError } from './response-contract-registration.mts'
import { parseHeaderContract } from './header-contract-parser.mts'
import {
  collectHandlerBindings,
  enclosingRouteBinding,
  visit,
} from './response-contract-route-analysis.mts'
import type { HeaderContract, HeaderContractRegistry } from './header-contract-types.mts'

const cache = new Map<string, HeaderContractRegistry>()
let cacheGeneration: BackendProgramGeneration | undefined

export function loadBackendHeaderContracts(
  knownResponseRoutes: ReadonlySet<string>,
): HeaderContractRegistry {
  const { generation, program, routeFiles } = loadBackendProgram()
  if (cacheGeneration !== generation) {
    cache.clear()
    cacheGeneration = generation
  }
  const cacheKey = [...knownResponseRoutes].toSorted().join('\n')
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const contracts = discoverApiHeaderContracts(program, routeFiles, knownResponseRoutes)
  cache.set(cacheKey, contracts)
  return contracts
}

export function discoverApiHeaderContracts(
  program: ts.Program,
  sourceFiles: readonly ts.SourceFile[],
  knownResponseRoutes: ReadonlySet<string>,
): HeaderContractRegistry {
  const checker = program.getTypeChecker()
  const bindings = collectHandlerBindings(sourceFiles, checker)
  const contracts = new Map<string, HeaderContract>()
  const knownOperations = new Set([...knownResponseRoutes].map(key => key.split('#')[0]!))
  for (const sourceFile of sourceFiles) {
    visit(sourceFile, node => {
      if (!ts.isCallExpression(node) || !isMarker(node.expression)) return
      const [keyNode, contractNode] = node.arguments
      if (
        !keyNode ||
        !ts.isStringLiteral(keyNode) ||
        !contractNode ||
        !ts.isObjectLiteralExpression(contractNode)
      ) {
        throw contractError(
          sourceFile,
          node,
          'apiHeaders requires a literal operation key and object contract',
        )
      }
      const binding = enclosingRouteBinding(node, checker, bindings)
      if (!binding)
        throw contractError(sourceFile, node, 'apiHeaders must be inside an app.route handler')
      const key = `${binding.method}:${binding.routeTemplate}`
      if (keyNode.text !== key)
        throw contractError(
          sourceFile,
          keyNode,
          `Header operation key "${keyNode.text}" does not match enclosing route ${key}`,
        )
      if (!knownOperations.has(key))
        throw contractError(
          sourceFile,
          keyNode,
          `apiHeaders references unknown response route ${key}`,
        )
      if (contracts.has(key))
        throw contractError(sourceFile, keyNode, `Duplicate apiHeaders marker for ${key}`)
      contracts.set(key, parseHeaderContract(sourceFile, contractNode))
    })
  }
  return Object.fromEntries([...contracts.entries()].toSorted(([a], [b]) => a.localeCompare(b)))
}

function isMarker(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === 'apiHeaders'
}
