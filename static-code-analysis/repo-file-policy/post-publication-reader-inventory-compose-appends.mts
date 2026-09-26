import { isNode, propertyName, walk } from '../targeted-guardrails/ast-utils.mts'
import {
  addBindingComposition,
  addComposedNames,
  appendReceiverName,
  canonicalCallNames,
  isAppendCall,
  isPushCall,
} from './post-publication-reader-inventory-source-helpers.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode

export function composeAppendAndPush(
  ast: Node,
  imported: Set<string>,
  canonicalBindings: Map<string, { declaredAt: number; names: string[] }>,
  localSqlStatements: Set<string>,
  consumedSqlStatements: Set<string>,
  consumedBindings: Set<string>,
  reassignedBindings: Set<string>,
  composed: Set<string>,
): void {
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
}
