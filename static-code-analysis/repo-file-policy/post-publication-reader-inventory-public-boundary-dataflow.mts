import { isFunctionLike, isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'
import {
  containsNode,
  walkWithAncestors,
} from './post-publication-reader-inventory-public-boundary-ast.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode

export function constrainingUseReachesConsumer(
  hasCall: Node,
  ancestors: Node[],
  ast: Node,
): boolean {
  let crossedCallback = false
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]!
    if (isFunctionLike(ancestor)) {
      if (crossedCallback) return false
      crossedCallback = true
      continue
    }
    if (ancestor.type === 'ReturnStatement') return true
    if (ancestor.type !== 'CallExpression' || !isNode(ancestor.callee)) continue
    const callName =
      ancestor.callee.type === 'Identifier'
        ? propertyName(ancestor.callee)
        : ancestor.callee.type === 'MemberExpression' && isNode(ancestor.callee.property)
          ? propertyName(ancestor.callee.property)
          : null
    if (callName === 'assert') return true
    if (!['filter', 'flatMap', 'map'].includes(callName ?? '')) {
      if (crossedCallback) return false
      continue
    }
    if (!hasCallDeterminesCallbackResult(hasCall, ancestors.slice(index + 1))) return false
    return derivedCallReachesConsumer(ancestors.slice(0, index), ast)
  }
  return false
}

function hasCallDeterminesCallbackResult(hasCall: Node, descendants: Node[]): boolean {
  const callback = descendants.find(isFunctionLike)
  if (!callback || !isNode(callback.body)) return false
  if (callback.body.type !== 'BlockStatement') return containsNode(callback.body, hasCall)
  return descendants.some(
    descendant => descendant.type === 'ReturnStatement' && containsNode(descendant, hasCall),
  )
}

function derivedCallReachesConsumer(ancestors: Node[], ast: Node): boolean {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]!
    if (ancestor.type === 'ReturnStatement') return true
    if (ancestor.type === 'AssignmentExpression' && isNode(ancestor.left)) {
      if (ancestor.left.type === 'MemberExpression') return true
      const name = propertyName(ancestor.left)
      return name ? derivedBindingIsConsumed(ast, name, ancestor.range?.[1] ?? 0) : false
    }
    if (ancestor.type === 'VariableDeclarator' && isNode(ancestor.id)) {
      const name = propertyName(ancestor.id)
      return name ? derivedBindingIsConsumed(ast, name, ancestor.range?.[1] ?? 0) : false
    }
  }
  return false
}

function derivedBindingIsConsumed(ast: Node, name: string, declaredAt: number): boolean {
  let consumed = false
  walkWithAncestors(ast, [], (node, ancestors) => {
    if (consumed || (node.range?.[0] ?? 0) <= declaredAt) return
    if (node.type === 'Identifier' && propertyName(node) === name) {
      if (ancestors.some(ancestor => ancestor.type === 'ReturnStatement')) consumed = true
      if (
        ancestors.some(ancestor => ancestor.type === 'ForOfStatement' && ancestor.right === node)
      ) {
        consumed = true
      }
      return
    }
    if (node.type !== 'MemberExpression' || !isNode(node.object)) return
    if (propertyName(node.object) !== name) return
    const method = isNode(node.property) ? propertyName(node.property) : null
    if (!['entries', 'filter', 'flatMap', 'map'].includes(method ?? '')) return
    const call = ancestors.at(-1)
    if (!call || call.type !== 'CallExpression') return
    if (ancestors.some(ancestor => ancestor.type === 'ReturnStatement')) {
      consumed = true
      return
    }
    const declaration = [...ancestors]
      .reverse()
      .find(ancestor => ancestor.type === 'VariableDeclarator' && isNode(ancestor.id))
    const derivedName = declaration && isNode(declaration.id) ? propertyName(declaration.id) : null
    if (declaration && derivedName) {
      consumed = derivedBindingIsConsumed(ast, derivedName, declaration.range?.[1] ?? 0)
    }
  })
  return consumed
}
