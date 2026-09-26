import { isNode, propertyName, walk } from '../targeted-guardrails/ast-utils.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode

export function terminalSqlExecutorBindings(ast: Node): Set<string> {
  const bindings = new Set<string>()
  walk(ast, node => {
    if (
      node.type !== 'ImportDeclaration' ||
      !isNode(node.source) ||
      node.source.type !== 'Literal' ||
      node.source.value !== '@data-stores/psql' ||
      !Array.isArray(node.specifiers)
    ) {
      return
    }
    for (const specifier of node.specifiers) {
      if (!isNode(specifier) || specifier.type !== 'ImportSpecifier') continue
      if (!isNode(specifier.imported) || !isNode(specifier.local)) continue
      const importedName = propertyName(specifier.imported)
      const localName = propertyName(specifier.local)
      if (
        importedName &&
        localName &&
        ['read', 'write', 'query', 'readStream', 'explainAnalyze'].includes(importedName)
      ) {
        bindings.add(localName)
      }
    }
  })
  walk(ast, node => {
    if (node.type !== 'VariableDeclarator' || !isNode(node.id) || !isNode(node.init)) return
    const binding = propertyName(node.id)
    if (!binding || node.init.type !== 'ConditionalExpression') return
    const consequent = propertyName(isNode(node.init.consequent) ? node.init.consequent : undefined)
    const alternate = propertyName(isNode(node.init.alternate) ? node.init.alternate : undefined)
    if ((consequent && bindings.has(consequent)) || (alternate && bindings.has(alternate))) {
      bindings.add(binding)
    }
  })
  return bindings
}
