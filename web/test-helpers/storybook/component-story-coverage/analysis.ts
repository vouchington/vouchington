import path from 'node:path'
import { analyzeTypeScriptModules, type TypeScriptModuleFacts } from 'no-mistakes'
import {
  createSourceModuleGraph,
  type SourceModuleGraph,
} from 'vouchington-tooling/source-module-graph'
import { repoRoot, sourceExtensions } from './source'

export interface StorybookSourceAnalysis {
  graph: SourceModuleGraph
  modules: ReadonlyMap<string, TypeScriptModuleFacts>
}

export async function analyzeStorybookSources(
  files: string[],
  root = repoRoot,
): Promise<StorybookSourceAnalysis> {
  const facts = await analyzeTypeScriptModules({ root, files })
  const graph = createSourceModuleGraph({
    root,
    extensions: sourceExtensions,
    aliases: { '@/': 'web/' },
    files,
    facts,
  })
  const modules = new Map<string, TypeScriptModuleFacts>()
  for (const item of facts.modules) {
    const file = path.relative(root, item.fileName).replaceAll('\\', '/')
    if (!item.complete) throw new Error(`Incomplete source module facts: ${file}`)
    modules.set(file, item)
  }
  if (modules.size !== files.length || files.some(file => !modules.has(file))) {
    throw new Error('Incomplete Storybook source inventory')
  }
  return { graph, modules }
}
