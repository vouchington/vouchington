import {
  isShadowedAtUse,
  isThenBoundaryParameter,
} from './post-publication-reader-inventory-public-boundary-then.mts'
import {
  isFunctionLike,
  isNode,
  parseSource,
  propertyName,
  walk,
} from '../targeted-guardrails/ast-utils.mts'
import {
  canonicalCallNames,
  importedCanonicalBindings,
} from './post-publication-reader-inventory-source-helpers.mts'
import {
  isSetHasCall,
  walkWithAncestors,
} from './post-publication-reader-inventory-public-boundary-ast.mts'
import { constrainingUseReachesConsumer } from './post-publication-reader-inventory-public-boundary-dataflow.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode
type BoundaryBinding = { declaredAt: number; declaration: Node; name: string }

/** Proves that public IDs constrain a collection or guard before it can be emitted. */
export function sourceFiltersWithPublicBoundary(content: string, symbols: string[]): boolean {
  const ast = parseSource(content).ast
  const imported = importedCanonicalBindings(ast, symbols)
  if (imported.size === 0) return false

  const bindings: BoundaryBinding[] = []
  walk(ast, node => {
    if (node.type !== 'VariableDeclarator' || !isNode(node.id) || !isNode(node.init)) return
    const name = propertyName(node.id)
    if (!name || !isDirectCanonicalBoundaryCall(node.init, imported)) return
    bindings.push({ declaredAt: node.range?.[1] ?? 0, declaration: node, name })
  })

  let constrained = false
  walkWithAncestors(ast, [], (node, ancestors) => {
    if (constrained) return
    if (node.type === 'ReturnStatement' && isNode(node.argument)) {
      if (isDirectCanonicalBoundaryCall(node.argument, imported)) {
        constrained = true
        return
      }
      const returned = propertyName(node.argument)
      if (
        returned &&
        bindings.some(
          binding =>
            binding.name === returned &&
            (node.range?.[0] ?? 0) > binding.declaredAt &&
            !isShadowedAtUse(binding, ancestors),
        )
      ) {
        constrained = true
      }
      return
    }
    if (
      !isSetHasCall(node) ||
      !hasCandidateIdArgument(node) ||
      !constrainingUseReachesConsumer(node, ancestors, ast)
    ) {
      return
    }
    const receiver = propertyName(
      isNode(node.callee) && node.callee.type === 'MemberExpression' && isNode(node.callee.object)
        ? node.callee.object
        : undefined,
    )
    if (
      receiver &&
      bindings.some(
        binding =>
          binding.name === receiver &&
          (node.range?.[0] ?? 0) > binding.declaredAt &&
          !isShadowedAtUse(binding, ancestors),
      )
    ) {
      constrained = true
      return
    }
    if (receiver && isThenBoundaryParameter(receiver, ancestors, imported)) constrained = true
  })
  return constrained
}

function isDirectCanonicalBoundaryCall(node: Node, imported: Set<string>): boolean {
  const expression = node.type === 'AwaitExpression' && isNode(node.argument) ? node.argument : node
  return (
    expression.type === 'CallExpression' &&
    isNode(expression.callee) &&
    expression.callee.type === 'Identifier' &&
    imported.has(propertyName(expression.callee) ?? '')
  )
}

function hasCandidateIdArgument(node: Node): boolean {
  if (!Array.isArray(node.arguments) || !isNode(node.arguments[0])) return false
  const argument = node.arguments[0]
  return (
    argument.type === 'MemberExpression' &&
    isNode(argument.property) &&
    propertyName(argument.property) === 'id'
  )
}
