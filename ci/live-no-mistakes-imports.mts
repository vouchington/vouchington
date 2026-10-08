import { readFileSync } from 'node:fs'

import ts from 'typescript'

const liveAnalysisImports = new Set([
  'analyzeProject',
  'check',
  'ciTopology',
  'ciTopologyImpact',
  'resolveCheck',
  'testsPlan',
  'validateMermaidMarkdown',
])

export async function liveAnalysisImportNames(
  root: string,
  files: string[],
): Promise<Map<string, string[]>> {
  if (files.length === 0) return new Map()
  // Local parse: tooling Vitest shares no-mistakes' machine-wide lock with `no-mistakes check`.
  return new Map(
    files.map(file => [file, liveNoMistakesImportNames(readRepoFile(root, file), file)]),
  )
}

function readRepoFile(root: string, path: string): string {
  return readFileSync(`${root}/${path}`, 'utf8')
}

function liveNoMistakesImportNames(source: string, path: string): string[] {
  const kind = path.endsWith('.tsx') || path.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
  const names: string[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'no-mistakes' &&
      node.importClause.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      const clauseTypeOnly = node.importClause.isTypeOnly
      for (const element of node.importClause.namedBindings.elements) {
        if (clauseTypeOnly || element.isTypeOnly) continue
        const imported = (element.propertyName ?? element.name).text
        if (liveAnalysisImports.has(imported)) names.push(imported)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return names
}
