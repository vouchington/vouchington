import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import ts from 'typescript'

import {
  getBackendProgramBuildCount,
  loadBackendProgram,
  simulateBackendProgramBuildTimeInputChangeForTest,
  simulateBackendProgramInputChangeForTest,
} from './backend-program.mts'
import { COLD_BACKEND_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS } from './backend-program-settlement.mts'
import { loadBackendQueryContracts } from './query-contract-registry.mts'
import { loadRegisteredRouteCatalog } from './registered-route-catalog.mts'
import { loadBackendRequestContracts } from './request-contract-registry.mts'
import { resetBackendContractDiscoveryCachesForTest } from './reset-backend-contract-caches-for-test.mts'
import { loadBackendResponseContracts } from './response-contract-registry.mts'

describe('loadBackendProgram build count', () => {
  afterEach(() => {
    resetBackendContractDiscoveryCachesForTest()
  })

  it(
    'settles and rebuilds every loader cache across two backend-program generations',
    () => {
      resetBackendContractDiscoveryCachesForTest()
      expect(getBackendProgramBuildCount()).toBe(0)

      const firstResponses = loadBackendResponseContracts(undefined, { onRouteError: () => {} })
      const firstRequests = loadBackendRequestContracts(undefined, { onRouteError: () => {} })
      const firstQueries = loadBackendQueryContracts(new Set(Object.keys(firstResponses)))
      const firstCatalog = loadRegisteredRouteCatalog()
      const settledBuildCount = getBackendProgramBuildCount()
      expect(settledBuildCount).toBeGreaterThanOrEqual(1)
      expect(settledBuildCount).toBeLessThanOrEqual(MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS)

      expect(loadBackendResponseContracts(undefined, { onRouteError: () => {} })).toBe(
        firstResponses,
      )
      expect(loadBackendRequestContracts(undefined, { onRouteError: () => {} })).toBe(firstRequests)
      expect(loadBackendQueryContracts(new Set(Object.keys(firstResponses)))).toBe(firstQueries)
      expect(loadRegisteredRouteCatalog()).toBe(firstCatalog)
      expect(getBackendProgramBuildCount()).toBe(settledBuildCount)

      simulateBackendProgramInputChangeForTest()

      const secondResponses = loadBackendResponseContracts(undefined, { onRouteError: () => {} })
      const secondRequests = loadBackendRequestContracts(undefined, { onRouteError: () => {} })
      const secondQueries = loadBackendQueryContracts(new Set(Object.keys(secondResponses)))
      const secondCatalog = loadRegisteredRouteCatalog()
      const secondBuildCount = getBackendProgramBuildCount()
      const invalidatedBuildCount = secondBuildCount - settledBuildCount

      expect(invalidatedBuildCount).toBeGreaterThanOrEqual(1)
      expect(invalidatedBuildCount).toBeLessThanOrEqual(MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS)
      expect(secondResponses).not.toBe(firstResponses)
      expect(secondRequests).not.toBe(firstRequests)
      expect(secondQueries).not.toBe(firstQueries)
      expect(secondCatalog).not.toBe(firstCatalog)
      expect(loadBackendResponseContracts(undefined, { onRouteError: () => {} })).toBe(
        secondResponses,
      )
      expect(loadBackendRequestContracts(undefined, { onRouteError: () => {} })).toBe(
        secondRequests,
      )
      expect(loadBackendQueryContracts(new Set(Object.keys(secondResponses)))).toBe(secondQueries)
      expect(loadRegisteredRouteCatalog()).toBe(secondCatalog)
      expect(getBackendProgramBuildCount()).toBe(secondBuildCount)
    },
    COLD_BACKEND_PROGRAM_TIMEOUT_MS * 2,
  )

  it(
    'retries one build-time input change before composing every loader cache',
    () => {
      resetBackendContractDiscoveryCachesForTest()
      simulateBackendProgramBuildTimeInputChangeForTest()
      const responses = loadBackendResponseContracts(undefined, { onRouteError: () => {} })
      const requests = loadBackendRequestContracts(undefined, { onRouteError: () => {} })
      const queries = loadBackendQueryContracts(new Set(Object.keys(responses)))
      const catalog = loadRegisteredRouteCatalog()
      const settledBuildCount = getBackendProgramBuildCount()

      expect(settledBuildCount).toBeGreaterThanOrEqual(2)
      expect(settledBuildCount).toBeLessThanOrEqual(MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS)
      expect(loadBackendResponseContracts(undefined, { onRouteError: () => {} })).toBe(responses)
      expect(loadBackendRequestContracts(undefined, { onRouteError: () => {} })).toBe(requests)
      expect(loadBackendQueryContracts(new Set(Object.keys(responses)))).toBe(queries)
      expect(loadRegisteredRouteCatalog()).toBe(catalog)
      expect(getBackendProgramBuildCount()).toBe(settledBuildCount)
    },
    COLD_BACKEND_PROGRAM_TIMEOUT_MS * MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS,
  )
})

describe('PostgreSQL row type contracts', () => {
  let program: ts.Program
  let checker: ts.TypeChecker

  beforeAll(() => {
    program = loadBackendProgram().program
    checker = program.getTypeChecker()
  }, COLD_BACKEND_PROGRAM_TIMEOUT_MS)

  function source(path: string): ts.SourceFile {
    const file = program.getSourceFiles().find(candidate => candidate.fileName.endsWith(path))
    if (!file) throw new Error(`Backend program does not include ${path}`)
    return file
  }

  function declarationType(path: string, name: string): ts.Type {
    const file = source(path)
    const moduleSymbol = checker.getSymbolAtLocation(file)
    const exported =
      moduleSymbol &&
      checker.getExportsOfModule(moduleSymbol).find(candidate => candidate.name === name)
    const symbol =
      exported &&
      (exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported)
    if (!symbol) throw new Error(`Missing ${name} in ${path}`)
    return symbol.flags & ts.SymbolFlags.Type
      ? checker.getDeclaredTypeOfSymbol(symbol)
      : checker.getTypeOfSymbolAtLocation(
          symbol,
          symbol.valueDeclaration ?? symbol.declarations![0],
        )
  }

  function defaultRowType(path: string, name: string): ts.Type {
    const signature = declarationType(path, name).getCallSignatures()[0]
    const declaration = signature?.getDeclaration()
    const defaultNode = declaration?.typeParameters?.[0]?.default
    if (!defaultNode) throw new Error(`Missing row default for ${name} in ${path}`)
    return checker.getTypeAtLocation(defaultNode)
  }

  it.each([
    ['backend/data-stores/psql/types.mts', 'QueryExecutor'],
    ['backend/data-stores/psql/runtime.mts', 'query'],
    ['backend/data-stores/psql/runtime.mts', 'read'],
    ['backend/data-stores/psql/runtime.mts', 'write'],
    ['backend/services/posts/tools/semantic.mts', 'queryPostsSemantic'],
  ])('%s %s defaults to a row that cannot masquerade as a complete Post', (path, name) => {
    const defaultRow = defaultRowType(path, name)
    const post = declarationType('backend/types/entities/post.mts', 'Post')
    expect(defaultRow.flags & ts.TypeFlags.Any).toBe(0)
    expect(post.flags & ts.TypeFlags.Any).toBe(0)
    if (checker.isTypeAssignableTo(defaultRow, post)) {
      throw new Error(
        `Default row masquerades as Post: default=${checker.typeToString(defaultRow)} flags=${defaultRow.flags}; Post=${checker.typeToString(post)} flags=${post.flags}`,
      )
    }
  })

  it('keeps the selected id string on a real explicitly projected read call', () => {
    const file = source('backend/services/posts/public-ids.mts')
    let projectedRead: ts.CallExpression | undefined
    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(file) === 'read' &&
        node.typeArguments?.[0]?.getText(file) === '{ id: string }'
      ) {
        projectedRead = node
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
    if (!projectedRead) throw new Error('Missing getPublicPostIds projected read')
    const result = checker.getAwaitedType(checker.getTypeAtLocation(projectedRead))
    if (!result) throw new Error('Projected read must return an awaitable result')
    const rowsProperty = checker.getPropertyOfType(result, 'rows')
    const rows = rowsProperty && checker.getTypeOfSymbolAtLocation(rowsProperty, projectedRead)
    const row = rows && checker.getIndexTypeOfType(rows, ts.IndexKind.Number)
    const idProperty = row && checker.getPropertyOfType(row, 'id')
    const id = idProperty && checker.getTypeOfSymbolAtLocation(idProperty, projectedRead)
    expect(id && checker.typeToString(id)).toBe('string')
  })
})
