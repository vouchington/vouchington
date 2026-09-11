import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

import { extractContractSchema, hashContractSchema } from './contract-schema.mts'
import type { ContractSchema, ExtractedResponseContract } from './contract-schema-types.mts'
import { isContextMethod, responseMarker, visit } from './response-contract-route-analysis.mts'
import type { BackendResponseContract } from './response-contract-types.mts'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

export function responseBodyExpression(call: ts.CallExpression): ts.Expression | undefined {
  if (isContextMethod(call.expression, 'json')) return call.arguments[0]
  if (!isContextMethod(call.expression, 'pipeline')) return undefined
  const pipelineBody = call.arguments[0]
  if (
    !pipelineBody ||
    !ts.isCallExpression(pipelineBody) ||
    !ts.isIdentifier(pipelineBody.expression) ||
    pipelineBody.expression.text !== 'streamJsonObject'
  ) {
    return undefined
  }
  return pipelineBody.arguments[0]
}

export function containsResponseMarker(node: ts.Node): boolean {
  let found = false
  visit(node, child => {
    if (ts.isCallExpression(child) && responseMarker(child.expression)) found = true
  })
  return found
}

export function extractBodyContract(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  location: string,
): ExtractedResponseContract {
  const body = call.arguments[1]
  if (!body) throw contractError(sourceFile, call, 'apiResponse requires a response body')
  return extractContractSchema(checker.getTypeAtLocation(body), checker, location)
}

export function registerContract(
  contracts: Map<string, BackendResponseContract>,
  key: string,
  contract: BackendResponseContract,
): void {
  const existing = contracts.get(key)
  if (!existing) {
    contracts.set(key, contract)
    return
  }
  if (existing.hash !== contract.hash) {
    throw new Error(
      `Backend response contract "${key}" resolves to multiple backend response schemas at ${existing.source} and ${contract.source}`,
    )
  }
}

export function noContentContract(source: string): ExtractedResponseContract {
  const schema: ContractSchema = { root: { type: 'null' }, definitions: {} }
  return { source, schema, hash: hashContractSchema(schema) }
}

export function sourceLocation(sourceFile: ts.SourceFile, _node: ts.Node): string {
  const file = sourceFile.fileName.startsWith(repoRoot)
    ? relative(repoRoot, sourceFile.fileName)
    : sourceFile.fileName
  return normalizePath(file)
}

export function contractError(sourceFile: ts.SourceFile, node: ts.Node, message: string): Error {
  return new Error(`${sourceLocation(sourceFile, node)}: ${message}`)
}

export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}

export function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => '\n',
  })
}
