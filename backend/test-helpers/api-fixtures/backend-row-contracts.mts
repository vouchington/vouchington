import assert from 'node:assert/strict'

import type { CallExpression, Node, Program, SourceFile, Type, TypeNode } from 'typescript'

import {
  forEachTypescriptChild,
  isTypescriptCallExpression,
  isTypescriptIdentifier,
  typescriptIndexKind,
  typescriptSymbolFlags,
  typescriptTypeFlags,
} from './program-paths.mts'

/** Checks the PostgreSQL row projections and defaults in the real backend TypeScript program. */
export function assertBackendRowContracts(program: Program): void {
  const checker = program.getTypeChecker()

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

  for (const [path, name] of [
    ['backend/data-stores/psql/types.mts', 'QueryExecutor'],
    ['backend/data-stores/psql/runtime.mts', 'query'],
    ['backend/data-stores/psql/runtime.mts', 'read'],
    ['backend/data-stores/psql/runtime.mts', 'write'],
  ]) {
    const defaultRow = defaultRowType(path, name)
    const post = declarationType('backend/types/entities/post.mts', 'Post')
    assert.equal(defaultRow.flags & typescriptTypeFlags.Any, 0)
    assert.equal(post.flags & typescriptTypeFlags.Any, 0)
    if (checker.isTypeAssignableTo(defaultRow, post)) {
      throw new Error(
        `Default row masquerades as Post: default=${checker.typeToString(defaultRow)} flags=${defaultRow.flags}; Post=${checker.typeToString(post)} flags=${post.flags}`,
      )
    }
  }

  const projectedFile = source('backend/services/posts/public-ids.mts')
  let projectedRead: CallExpression | undefined
  function visitProjectedRead(node: Node): void {
    if (
      isTypescriptCallExpression(node) &&
      node.expression.getText(projectedFile) === 'read' &&
      node.typeArguments?.[0]?.getText(projectedFile) === '{ id: string }'
    ) {
      projectedRead = node
    }
    forEachTypescriptChild(node, visitProjectedRead)
  }
  visitProjectedRead(projectedFile)
  if (!projectedRead) throw new Error('Missing getPublicPostIds projected read')
  const result = checker.getAwaitedType(checker.getTypeAtLocation(projectedRead))
  if (!result) throw new Error('Projected read must return an awaitable result')
  const rowsProperty = checker.getPropertyOfType(result, 'rows')
  const rows = rowsProperty && checker.getTypeOfSymbolAtLocation(rowsProperty, projectedRead)
  const row = rows && checker.getIndexTypeOfType(rows, typescriptIndexKind.Number)
  const idProperty = row && checker.getPropertyOfType(row, 'id')
  const id = idProperty && checker.getTypeOfSymbolAtLocation(idProperty, projectedRead)
  assert.equal(id && checker.typeToString(id), 'string')

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

  for (const path of [
    'backend/services/posts/create/insert-post.mts',
    'backend/services/posts/create-story-post.mts',
  ]) {
    const { row, at } = writeReturningRow(path)
    const post = declarationType('backend/types/entities/post.mts', 'Post')
    assert.equal(row.flags & typescriptTypeFlags.Any, 0)
    assert.equal(checker.isTypeAssignableTo(row, post), false)
    for (const name of ['clearance_status', 'clearance_reason', 'clearance_updated_at']) {
      assert.equal(rowProperty(row, at, name), undefined)
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
      created_via: '"web" | "swift" | "dotnet" | "api" | "mcp" | "system"',
      llm_moderation_content_sha256: 'Buffer<ArrayBufferLike>',
      search_vector: 'string | null',
    }
    for (const [name, expected] of Object.entries(consumed)) {
      assert.deepEqual({ name, type: rowProperty(row, at, name) }, { name, type: expected })
    }
  }
}
