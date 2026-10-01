import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type {
  CallExpression,
  Node,
  Program,
  SourceFile,
  Type,
  TypeChecker,
  TypeNode,
} from 'typescript'

import {
  forEachTypescriptChild,
  isTypescriptCallExpression,
  isTypescriptIdentifier,
  typescriptIndexKind,
  typescriptSymbolFlags,
  typescriptTypeFlags,
} from './program-paths.mts'
import {
  getBackendProgramBuildCount,
  loadBackendProgram,
  simulateBackendProgramBuildTimeInputChangeForTest,
  simulateBackendProgramInputChangeForTest,
} from './backend-program.mts'
import { COLD_BACKEND_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS } from './backend-program-settlement.mts'
import {
  loadBackendQueryContracts,
  loadBackendRequestContracts,
  loadBackendResponseContracts,
  loadRegisteredRouteCatalog,
} from './backend-contract-catalog.mts'
import { resetBackendContractDiscoveryCachesForTest } from './reset-backend-contract-caches-for-test.mts'

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
  let program: Program
  let checker: TypeChecker

  beforeAll(() => {
    program = loadBackendProgram().program
    checker = program.getTypeChecker()
  }, COLD_BACKEND_PROGRAM_TIMEOUT_MS)

  function source(path: string): SourceFile {
    const file = program.getSourceFiles().find(candidate => candidate.fileName.endsWith(path))
    if (!file) throw new Error(`Backend program does not include ${path}`)
    return file
  }

  function declarationType(path: string, name: string): Type {
    const file = source(path)
    const moduleSymbol = checker.getSymbolAtLocation(file)
    const exported =
      moduleSymbol &&
      checker.getExportsOfModule(moduleSymbol).find(candidate => candidate.name === name)
    const symbol =
      exported &&
      (exported.flags & typescriptSymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported)
    if (!symbol) throw new Error(`Missing ${name} in ${path}`)
    return symbol.flags & typescriptSymbolFlags.Type
      ? checker.getDeclaredTypeOfSymbol(symbol)
      : checker.getTypeOfSymbolAtLocation(
          symbol,
          symbol.valueDeclaration ?? symbol.declarations![0],
        )
  }

  function defaultRowType(path: string, name: string): Type {
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
  ])('%s %s defaults to a row that cannot masquerade as a complete Post', (path, name) => {
    const defaultRow = defaultRowType(path, name)
    const post = declarationType('backend/types/entities/post.mts', 'Post')
    expect(defaultRow.flags & typescriptTypeFlags.Any).toBe(0)
    expect(post.flags & typescriptTypeFlags.Any).toBe(0)
    if (checker.isTypeAssignableTo(defaultRow, post)) {
      throw new Error(
        `Default row masquerades as Post: default=${checker.typeToString(defaultRow)} flags=${defaultRow.flags}; Post=${checker.typeToString(post)} flags=${post.flags}`,
      )
    }
  })

  it('keeps the selected id string on a real explicitly projected read call', () => {
    const file = source('backend/services/posts/public-ids.mts')
    let projectedRead: CallExpression | undefined
    function visit(node: Node): void {
      if (
        isTypescriptCallExpression(node) &&
        node.expression.getText(file) === 'read' &&
        node.typeArguments?.[0]?.getText(file) === '{ id: string }'
      ) {
        projectedRead = node
      }
      forEachTypescriptChild(node, visit)
    }
    visit(file)
    if (!projectedRead) throw new Error('Missing getPublicPostIds projected read')
    const result = checker.getAwaitedType(checker.getTypeAtLocation(projectedRead))
    if (!result) throw new Error('Projected read must return an awaitable result')
    const rowsProperty = checker.getPropertyOfType(result, 'rows')
    const rows = rowsProperty && checker.getTypeOfSymbolAtLocation(rowsProperty, projectedRead)
    const row = rows && checker.getIndexTypeOfType(rows, typescriptIndexKind.Number)
    const idProperty = row && checker.getPropertyOfType(row, 'id')
    const id = idProperty && checker.getTypeOfSymbolAtLocation(idProperty, projectedRead)
    expect(id && checker.typeToString(id)).toBe('string')
  })

  function writeReturningRow(path: string): { row: Type; at: TypeNode } {
    const file = source(path)
    let typeArgument: TypeNode | undefined
    function visit(node: Node): void {
      if (
        isTypescriptCallExpression(node) &&
        isTypescriptIdentifier(node.expression) &&
        node.expression.text === 'write' &&
        node.typeArguments?.[0]
      ) {
        if (typeArgument) throw new Error(`Multiple write type arguments in ${path}`)
        typeArgument = node.typeArguments[0]
      }
      forEachTypescriptChild(node, visit)
    }
    visit(file)
    if (!typeArgument) throw new Error(`Missing write type argument in ${path}`)
    return { row: checker.getTypeFromTypeNode(typeArgument), at: typeArgument }
  }

  function rowProperty(row: Type, at: Node, name: string): string | undefined {
    const property = checker.getPropertyOfType(row, name)
    if (!property) return undefined
    return checker.typeToString(checker.getTypeOfSymbolAtLocation(property, at))
  }

  it.each([
    'backend/services/posts/create/insert-post.mts',
    'backend/services/posts/create-story-post.mts',
  ])('%s types INSERT RETURNING * as a posts table row', path => {
    const { row, at } = writeReturningRow(path)
    const post = declarationType('backend/types/entities/post.mts', 'Post')
    expect(row.flags & typescriptTypeFlags.Any).toBe(0)
    expect(checker.isTypeAssignableTo(row, post)).toBe(false)
    for (const name of ['clearance_status', 'clearance_reason', 'clearance_updated_at']) {
      expect(rowProperty(row, at, name)).toBeUndefined()
    }
    const consumed = {
      id: 'string',
      root_id: 'string | null',
      community_id: 'string | null',
      title: 'string',
      markdown: 'string',
      ai_summary_markdown: 'string',
      broadcast: 'PostBroadcast',
      privacy: 'PostPrivacy',
      is_anonymous: 'boolean',
      created_by_id: 'string | null',
      structured_data: 'unknown',
      data_point_vertical: 'string | null',
      declared_language: 'string | null',
      deleted_at: 'Date | null',
      archived_at: 'Date | null',
      created_via: 'ContentCreationChannel | null',
      llm_moderation_content_sha256: 'Buffer<ArrayBufferLike>',
      search_vector: 'string | null',
    }
    for (const [name, expected] of Object.entries(consumed)) {
      expect({ name, type: rowProperty(row, at, name) }).toEqual({ name, type: expected })
    }
  })
})
