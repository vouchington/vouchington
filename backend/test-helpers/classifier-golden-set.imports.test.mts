import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const classifierGoldenEntrypoints = [
  'backend/agents/post-classifier/post-classifier.golden.openrouter.test.mts',
  'backend/agents/autotagger/autotagger.golden.openrouter.test.mts',
]
const configurationTables =
  '(?:classifier_candidate_thresholds|classifier_prompt_versions|classifiers)'
const configurationWrite = new RegExp(
  `\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${configurationTables}\\b`,
  'i',
)

describe('classifier golden regression set import graph', () => {
  it('cannot write classifier thresholds, prompt versions, or configuration', () => {
    const graph = dependencyGraph(classifierGoldenEntrypoints)
    const writers = [...graph].filter(file => configurationWrite.test(ts.sys.readFile(file) ?? ''))
    expect(writers.map(file => relativePath(file))).toEqual([])
    expect([...graph].map(relativePath)).toEqual(
      expect.arrayContaining([
        'backend/agents/classifiers/prepare-single-call.mts',
        'backend/agents/post-classifier/classifier-input.mts',
        'backend/agents/autotagger/dispatch-classifier-bindings.mts',
        'backend/agents/autotagger/content.mts',
      ]),
    )
  })
})

function dependencyGraph(entrypoints: readonly string[]): Set<string> {
  const configPath = resolve(repositoryRoot, 'backend/tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath)).options
  const graph = new Set<string>()
  const pending = entrypoints.map(path => resolve(repositoryRoot, path))

  while (pending.length > 0) {
    const sourcePath = pending.pop()!
    if (graph.has(sourcePath)) continue
    const sourceText = ts.sys.readFile(sourcePath)
    if (sourceText === undefined)
      throw new Error(`Missing classifier golden dependency ${sourcePath}`)
    graph.add(sourcePath)
    const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true)
    for (const specifier of moduleSpecifiers(sourceFile)) {
      const resolved = ts.resolveModuleName(specifier, sourcePath, options, ts.sys).resolvedModule
      if (!resolved) {
        if (
          specifier.startsWith('.') ||
          specifier.startsWith('@agents/') ||
          specifier.startsWith('@services/')
        ) {
          throw new Error(`Could not resolve ${specifier} from ${relativePath(sourcePath)}`)
        }
        continue
      }
      const resolvedPath = resolve(
        ts.sys.realpath?.(resolved.resolvedFileName) ?? resolved.resolvedFileName,
      )
      if (
        resolvedPath.startsWith(`${repositoryRoot}${sep}`) &&
        !resolvedPath.includes(`${sep}node_modules${sep}`)
      ) {
        pending.push(resolvedPath)
      }
    }
  }
  return graph
}

function moduleSpecifiers(source: ts.SourceFile): string[] {
  const specifiers: string[] = []
  for (const statement of source.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.push(statement.moduleSpecifier.text)
    }
  }
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return specifiers
}

function relativePath(path: string): string {
  return path
    .slice(repositoryRoot.length + 1)
    .split(sep)
    .join('/')
}
