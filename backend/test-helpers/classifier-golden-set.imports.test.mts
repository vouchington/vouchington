import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { analyzeTypeScriptModules, type TypeScriptModuleFacts } from 'no-mistakes'
import ts from 'typescript'
import { createSourceModuleGraph } from 'vouchington-tooling/source-module-graph'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
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
const sourceExtensions = ['.mts', '.ts', '.tsx', '.cts', '.mjs', '.js', '.jsx', '.cjs']

describe('classifier golden regression set import graph', () => {
  it('cannot write classifier thresholds, prompt versions, or configuration', async () => {
    const graph = await dependencyGraph(classifierGoldenEntrypoints, repositoryRoot)
    const writers = [...graph].filter(file => configurationWrite.test(readFileSync(file, 'utf8')))
    expect(writers.map(file => relativePath(repositoryRoot, file))).toEqual([])
    expect([...graph].map(file => relativePath(repositoryRoot, file))).toEqual(
      expect.arrayContaining([
        'backend/agents/classifiers/prepare-single-call.mts',
        'backend/agents/post-classifier/classifier-input.mts',
        'backend/agents/autotagger/classifier-run-bindings.mts',
        'backend/agents/autotagger/content.mts',
        'email-templates/index.d.ts',
        'email-templates/types.mts',
      ]),
    )
  })

  it('follows type-only imports, export-from declarations, and literal dynamic imports', async () => {
    const root = await temporaryRepository({
      'backend/entry.mts':
        "import type { Shape } from './types.mjs'; import 'missing-external'; export { value } from './exported.mjs'; void import('./dynamic.mjs'); void require('./required.mjs');",
      'backend/types.mts': 'export interface Shape { value: string }',
      'backend/exported.mts': 'export const value = 1',
      'backend/dynamic.mts': 'export const loaded = true',
      'backend/required.mts': 'export const notTraversed = true',
    })
    try {
      const graph = await dependencyGraph(['backend/entry.mts'], root)
      expect([...graph].map(file => relativePath(root, file)).toSorted()).toEqual([
        'backend/dynamic.mts',
        'backend/entry.mts',
        'backend/exported.mts',
        'backend/types.mts',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each(["import './missing.mjs'", "import '@agents/missing'", "import '@services/missing'"])(
    'fails closed for an unresolved local dependency: %s',
    async source => {
      const root = await temporaryRepository({ 'backend/entry.mts': source })
      try {
        await expect(dependencyGraph(['backend/entry.mts'], root)).rejects.toThrow(
          /Could not resolve/,
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )
})

async function dependencyGraph(entrypoints: readonly string[], root: string): Promise<Set<string>> {
  const configPath = resolve(root, 'backend/tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath)).options
  const graph = new Set<string>()
  const pending = entrypoints.map(path => resolve(root, path))
  const facts: TypeScriptModuleFacts[] = []
  const aliases: Record<string, string> = {}

  while (pending.length > 0) {
    const sourcePath = pending.pop()!
    if (graph.has(sourcePath)) continue
    const report = await analyzeTypeScriptModules({ root, files: [sourcePath] })
    const sourceFacts = report.modules[0]
    if (!sourceFacts?.complete || resolve(sourceFacts.fileName) !== sourcePath) {
      throw new Error(`Incomplete classifier golden dependency ${relativePath(root, sourcePath)}`)
    }
    graph.add(sourcePath)
    facts.push(sourceFacts)
    for (const specifier of moduleSpecifiers(sourceFacts)) {
      const resolved = ts.resolveModuleName(specifier, sourcePath, options, ts.sys).resolvedModule
      if (!resolved) {
        if (
          specifier.startsWith('.') ||
          specifier.startsWith('@agents/') ||
          specifier.startsWith('@services/')
        ) {
          throw new Error(`Could not resolve ${specifier} from ${relativePath(root, sourcePath)}`)
        }
        continue
      }
      const resolvedPath = resolve(
        ts.sys.realpath?.(resolved.resolvedFileName) ?? resolved.resolvedFileName,
      )
      if (
        resolvedPath.startsWith(`${root}${sep}`) &&
        !resolvedPath.includes(`${sep}node_modules${sep}`)
      ) {
        pending.push(resolvedPath)
        if (!specifier.startsWith('.')) {
          const target = relativePath(root, resolvedPath)
          if (aliases[specifier] && aliases[specifier] !== target) {
            throw new Error(`Ambiguous classifier golden dependency ${specifier}`)
          }
          aliases[specifier] = target
        }
      }
    }
  }

  const sourceGraph = createSourceModuleGraph({
    root,
    extensions: sourceExtensions,
    aliases,
    files: [...graph],
    // The previous walk followed literal import() calls, but not CommonJS require().
    facts: {
      modules: facts.map(item => ({
        ...item,
        loads: item.loads.filter(load => load.kind === 'dynamicImport'),
      })),
    },
  })
  const reachable = new Set(sourceGraph.reachableFrom(entrypoints))
  if (
    reachable.size !== graph.size ||
    [...graph].some(file => !reachable.has(relativePath(root, file)))
  ) {
    throw new Error('Incomplete classifier golden source graph')
  }
  return graph
}

function moduleSpecifiers(module: TypeScriptModuleFacts): string[] {
  return [
    ...module.imports.map(item => item.specifier),
    ...module.exports.flatMap(item => (item.specifier ? [item.specifier] : [])),
    ...module.loads.flatMap(item => (item.kind === 'dynamicImport' ? [item.specifier] : [])),
  ]
}

async function temporaryRepository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'classifier-golden-'))
  await mkdir(resolve(root, 'backend'), { recursive: true })
  await writeFile(
    resolve(root, 'backend/tsconfig.json'),
    '{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext"}}',
  )
  for (const [file, source] of Object.entries(files)) {
    await writeFile(resolve(root, file), source)
  }
  return root
}

function relativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}
