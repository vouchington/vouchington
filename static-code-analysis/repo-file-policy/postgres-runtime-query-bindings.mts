import { isFunctionLike, isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'

import {
  importedDefaultNames,
  importedNamedNames,
  transactionCallbackParameters,
  transactionHelperIndexes,
} from './postgres-runtime-query-import-provenance.mts'
import { rootBinding } from './postgres-runtime-query-binding-resolution.mts'
import { hasBindingWrite } from './postgres-runtime-query-binding-writes.mts'
import { classifyDynamicUse, markDynamic } from './postgres-runtime-query-escapes.mts'
import { predeclareFunctionScopedVars } from './postgres-runtime-query-function-vars.mts'
import { createsScope, predeclareScope } from './postgres-runtime-query-lexical-scope.mts'
import { type QueryNode } from './postgres-runtime-query-syntax.mts'
import type { ScopeBinding, SqlStatementBinding } from './postgres-runtime-query-types.mts'

export type { SqlStatementBinding } from './postgres-runtime-query-types.mts'
export function sqlStatementBindings(ast: QueryNode): Map<QueryNode, SqlStatementBinding> {
  const bindings = new Map<QueryNode, SqlStatementBinding>()
  const sqlTags = importedDefaultNames(ast, 'sql-template-strings')
  const executors = importedNamedNames(ast, new Set(['query', 'read', 'write']))
  const transactionCallbacks = transactionCallbackParameters(ast, transactionHelperIndexes(ast))
  visitWithScopes(ast, [], bindings, sqlTags, executors, transactionCallbacks)
  return bindings
}

function visitWithScopes(
  node: QueryNode,
  scopes: Array<Map<string, ScopeBinding>>,
  bindings: Map<QueryNode, SqlStatementBinding>,
  sqlTags: Set<string>,
  executors: Set<string>,
  transactionCallbacks: Map<QueryNode, string>,
  transactionExecutor?: { depth: number; name: string },
): void {
  const createsNewScope = createsScope(node)
  let currentScopes = scopes
  let currentSqlTags = sqlTags
  if (createsNewScope) {
    const currentScope = new Map<string, ScopeBinding>()
    currentSqlTags = predeclareScope(node, currentScope, sqlTags)
    currentScopes = [...scopes, currentScope]
  }
  const callbackExecutor =
    isFunctionLike(node) &&
    transactionCallbacks.has(node) &&
    currentScopes.at(-1)?.get(transactionCallbacks.get(node)!) === null &&
    !hasBindingWrite(node, transactionCallbacks.get(node)!)
      ? { depth: currentScopes.length, name: transactionCallbacks.get(node)! }
      : transactionExecutor
  let functionBodyScopes = currentScopes
  let functionBodySqlTags = currentSqlTags
  if (isFunctionLike(node)) {
    const bodyScope = new Map<string, ScopeBinding>()
    functionBodySqlTags = new Set(currentSqlTags)
    predeclareFunctionScopedVars(node, bodyScope, functionBodySqlTags)
    functionBodyScopes = [...currentScopes, bodyScope]
  }

  classifyDynamicUse(node, currentScopes)
  if (node.type === 'CallExpression' && Array.isArray(node.arguments)) {
    const callName =
      isNode(node.callee) && node.callee.type === 'Identifier' ? propertyName(node.callee) : null
    if (callName && currentScopes.slice(1).some(scope => scope.has(callName))) {
      for (const argument of node.arguments) {
        if (isNode(argument) && isFunctionLike(argument)) transactionCallbacks.delete(argument)
      }
    }
    const firstArgument = node.arguments.find(isNode)
    for (const argument of node.arguments) {
      if (!isNode(argument)) continue
      const calleeName =
        isNode(node.callee) && node.callee.type === 'Identifier' ? propertyName(node.callee) : null
      const trustedExecutor =
        argument === firstArgument &&
        !!calleeName &&
        ((executors.has(calleeName) &&
          !currentScopes.slice(1).some(scope => scope.has(calleeName))) ||
          (callbackExecutor?.name === calleeName &&
            !currentScopes.slice(callbackExecutor.depth).some(scope => scope.has(calleeName))))
      if (!trustedExecutor) markDynamic(argument, currentScopes, true)
      const binding = rootBinding(argument, currentScopes)
      if (!binding?.text) continue
      binding.callUses.push({ argument, call: node, trustedExecutor })
      if (argument === firstArgument) bindings.set(argument, binding)
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    const childScopes = isFunctionLike(node) && key === 'body' ? functionBodyScopes : currentScopes
    const childSqlTags =
      isFunctionLike(node) && key === 'body' ? functionBodySqlTags : currentSqlTags
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child))
          visitWithScopes(
            child,
            childScopes,
            bindings,
            childSqlTags,
            executors,
            transactionCallbacks,
            callbackExecutor,
          )
      }
    } else if (isNode(value)) {
      visitWithScopes(
        value,
        childScopes,
        bindings,
        childSqlTags,
        executors,
        transactionCallbacks,
        callbackExecutor,
      )
    }
  }
}
