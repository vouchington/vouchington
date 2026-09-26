import { isFunctionLike, isNode, propertyName } from '../targeted-guardrails/ast-utils.mts'
import { canonicalCallNames } from './post-publication-reader-inventory-source-helpers.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode
type BoundaryBinding = { declaredAt: number; declaration: Node; name: string }

export function isShadowedAtUse(binding: BoundaryBinding, ancestors: Node[]): boolean {
  return ancestors.some(ancestor => {
    if (!isFunctionLike(ancestor) || !Array.isArray(ancestor.params)) return false
    if (
      typeof ancestor.range?.[0] === 'number' &&
      typeof ancestor.range?.[1] === 'number' &&
      (binding.declaration.range?.[0] ?? 0) >= ancestor.range[0] &&
      (binding.declaration.range?.[1] ?? 0) <= ancestor.range[1]
    ) {
      return false
    }
    return ancestor.params.some(param => isNode(param) && propertyName(param) === binding.name)
  })
}
export function isThenBoundaryParameter(
  receiver: string,
  ancestors: Node[],
  imported: Set<string>,
): boolean {
  return ancestors.some(ancestor => {
    if (!isFunctionLike(ancestor) || !Array.isArray(ancestor.params)) return false
    if (!ancestor.params.some(param => isNode(param) && propertyName(param) === receiver))
      return false
    const parent = ancestors[ancestors.indexOf(ancestor) - 1]
    if (!parent || parent.type !== 'CallExpression' || !isNode(parent.callee)) return false
    if (
      parent.callee.type !== 'MemberExpression' ||
      !isNode(parent.callee.object) ||
      !isNode(parent.callee.property) ||
      propertyName(parent.callee.property) !== 'then'
    ) {
      return false
    }
    return canonicalCallNames(parent.callee.object, imported).length > 0
  })
}
