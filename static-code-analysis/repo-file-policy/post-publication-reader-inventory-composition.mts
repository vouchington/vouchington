import { isNode, parseSource, propertyName, walk } from '../targeted-guardrails/ast-utils.mts'
import {
  addBindingComposition,
  addComposedNames,
  appendReceiverName,
  canonicalCallNames,
  importedCanonicalBindings,
  isAppendCall,
  isPushCall,
  isSqlStatementInitializer,
  isTerminalSqlCall,
  terminalSqlExecutorBindings,
} from './post-publication-reader-inventory-source-helpers.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode

export function sourceImportsAndUsesBoundaryAny(content: string, symbols: string[]): boolean {
  const ast = parseSource(content).ast
  const imported = importedCanonicalBindings(ast, symbols)
  if (imported.size === 0) return false

  const resultBindings = new Map<string, number>()
  walk(ast, (node: Node) => {
    if (node.type !== 'VariableDeclarator' || !isNode(node.id) || !isNode(node.init)) return
    const binding = propertyName(node.id)
    const calls = canonicalCallNames(node.init, imported)
    if (!binding && calls.length > 0) imported.add('__used__')
    if (binding && calls.length > 0) {
      resultBindings.set(binding, node.range?.[1] ?? 0)
    }
  })
  walk(ast, (node: Node) => {
    if (node.type === 'ReturnStatement' && isNode(node.argument)) {
      if (canonicalCallNames(node.argument, imported).length > 0) imported.add('__used__')
      const binding = propertyName(node.argument)
      if (binding && resultBindings.has(binding)) imported.add('__used__')
      return
    }
    if (node.type !== 'CallExpression') return
    if (isMeaningfulBoundaryCall(node, imported)) imported.add('__used__')
    if (!Array.isArray(node.arguments)) return
    for (const argument of node.arguments) {
      if (!isNode(argument)) continue
      const binding = propertyName(argument)
      const declaredAt = binding ? resultBindings.get(binding) : undefined
      if (binding && declaredAt !== undefined && (argument.range?.[0] ?? 0) > declaredAt) {
        imported.add('__used__')
      }
    }
  })
  walk(ast, (node: Node) => {
    if (node.type !== 'MemberExpression' || !isNode(node.object)) return
    const binding = propertyName(node.object)
    const declaredAt = binding ? resultBindings.get(binding) : undefined
    if (binding && declaredAt !== undefined && (node.range?.[0] ?? 0) > declaredAt) {
      imported.add('__used__')
    }
  })
  return imported.has('__used__')
}

/** Proves a SQL builder result reaches a live SQL statement or a compositional return/push path. */
export function sourceImportsAndComposesAny(content: string, symbols: string[]): boolean {
  const ast = parseSource(content).ast
  const terminalExecutors = terminalSqlExecutorBindings(ast)
  const imported = importedCanonicalBindings(ast, symbols)
  if (imported.size === 0) return false

  const canonicalBindings = new Map<string, { declaredAt: number; names: string[] }>()
  const localSqlStatements = new Set<string>()
  const localCollections = new Set<string>()
  const consumedSqlStatements = new Set<string>()
  const consumedBindings = new Set<string>()
  const reassignedBindings = new Set<string>()
  const composed = new Set<string>()
  walk(ast, (node: Node) => {
    if (node.type !== 'VariableDeclarator') return
    const binding = propertyName(isNode(node.id) ? node.id : undefined)
    const initializer = isNode(node.init) ? node.init : undefined
    if (binding && isSqlStatementInitializer(initializer)) localSqlStatements.add(binding)
    if (binding && initializer?.type === 'ArrayExpression') localCollections.add(binding)
    const canonicalCalls = canonicalCallNames(initializer, imported)
    if (binding && canonicalCalls.length > 0 && typeof node.range?.[1] === 'number') {
      canonicalBindings.set(binding, { declaredAt: node.range[1], names: canonicalCalls })
    }
  })
  walk(ast, (node: Node) => {
    if (node.type !== 'AssignmentExpression' || !isNode(node.left)) return
    const binding = propertyName(node.left)
    if (binding) reassignedBindings.add(binding)
  })
  walk(ast, (node: Node) => {
    if (node.type === 'ReturnStatement' && isNode(node.argument)) {
      const binding = propertyName(node.argument)
      if (binding) consumedSqlStatements.add(binding)
      if (binding) consumedBindings.add(binding)
      addComposedNames(composed, canonicalCallNames(node.argument, imported))
      addBindingComposition(
        composed,
        canonicalBindings.get(binding ?? ''),
        reassignedBindings.has(binding ?? ''),
      )
      return
    }
    if (node.type !== 'CallExpression' || !Array.isArray(node.arguments)) return
    const appends = isAppendCall(node)
    const pushes = isPushCall(node)
    const terminal = isTerminalSqlCall(node, terminalExecutors)
    const pushReceiver = pushes ? appendReceiverName(node) : null
    for (const argument of node.arguments) {
      if (!isNode(argument)) continue
      const binding = propertyName(argument)
      if (!binding) continue
      if (terminal) {
        consumedSqlStatements.add(binding)
      }
      if (pushes && pushReceiver && !localCollections.has(pushReceiver)) {
        consumedSqlStatements.add(binding)
      }
      if (!appends || appendReceiverName(node) !== binding) consumedBindings.add(binding)
    }
    if (
      !appends &&
      !isPushCall(node) &&
      isNode(node.callee) &&
      node.callee.type === 'MemberExpression'
    ) {
      const receiver = propertyName(isNode(node.callee.object) ? node.callee.object : undefined)
      if (receiver) consumedBindings.add(receiver)
    }
  })
  walk(ast, (node: Node) => {
    if (node.type !== 'ForOfStatement' || !isNode(node.right)) return
    const binding = propertyName(node.right)
    if (binding) consumedBindings.add(binding)
  })
  walk(ast, (node: Node) => {
    if (!isAppendCall(node) || !Array.isArray(node.arguments)) return
    const receiver = appendReceiverName(node)
    if (receiver && localSqlStatements.has(receiver) && !consumedSqlStatements.has(receiver)) {
      return
    }
    for (const argument of node.arguments) {
      if (!isNode(argument)) continue
      addComposedNames(composed, canonicalCallNames(argument, imported))
      const binding = propertyName(argument)
      const declaration = canonicalBindings.get(binding ?? '')
      if (declaration && (argument.range?.[0] ?? 0) > declaration.declaredAt)
        addBindingComposition(composed, declaration, reassignedBindings.has(binding ?? ''))
    }
  })
  walk(ast, (node: Node) => {
    if (!isPushCall(node) || !Array.isArray(node.arguments)) return
    const collection = appendReceiverName(node)
    if (!collection || !consumedBindings.has(collection)) return
    for (const argument of node.arguments) {
      if (!isNode(argument)) continue
      addComposedNames(composed, canonicalCallNames(argument, imported))
      const binding = propertyName(argument)
      addBindingComposition(
        composed,
        canonicalBindings.get(binding ?? ''),
        reassignedBindings.has(binding ?? ''),
      )
    }
  })
  return [...imported].some(name => composed.has(name))
}

function isMeaningfulBoundaryCall(node: Node, imported: Set<string>): boolean {
  if (canonicalCallNames(node, imported).length === 0 || !isNode(node.callee)) return false
  if (node.callee.type === 'Identifier') {
    const callee = propertyName(node.callee)
    return callee !== 'ignore' && !imported.has(callee ?? '')
  }
  return (
    node.callee.type === 'MemberExpression' &&
    isNode(node.callee.property) &&
    ['all', 'allSettled', 'assert', 'then'].includes(propertyName(node.callee.property) ?? '')
  )
}
