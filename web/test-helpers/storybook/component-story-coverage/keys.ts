import type { SourceModuleGraph } from 'vouchington-tooling/source-module-graph'
import { componentRoot, exportKey, isStoryFile, storybookRoot } from './source'

export interface NamespaceComponentImport {
  file: string
  source: string
  local: string
}

export function reachableStorybookFiles(files: string[], graph: SourceModuleGraph): string[] {
  const stories = files.filter(file => file.startsWith(storybookRoot) && isStoryFile(file))
  return graph
    .reachableFrom(stories, { runtimeOnly: true })
    .filter(file => file.startsWith(storybookRoot))
}

export function coveredComponentKeys(storyFiles: string[], graph: SourceModuleGraph): Set<string> {
  const covered = new Set<string>()
  for (const file of storyFiles) {
    for (const entry of graph.runtimeImports(file)) {
      const resolved = graph.resolveSource(file, entry.specifier)
      if (!resolved?.startsWith(componentRoot)) continue
      for (const binding of entry.bindings) {
        if (binding.kind === 'namespace') continue
        covered.add(exportKey(resolved, binding.imported))
        const owner = graph.resolveExportOwner(resolved, binding.imported)
        if (owner) covered.add(exportKey(owner.file, owner.exportName))
      }
    }
  }
  return covered
}

export function namespaceComponentImports(
  storyFiles: string[],
  graph: SourceModuleGraph,
): NamespaceComponentImport[] {
  const imports: NamespaceComponentImport[] = []
  for (const file of storyFiles) {
    for (const entry of graph.runtimeImports(file)) {
      const resolved = graph.resolveSource(file, entry.specifier)
      if (!resolved?.startsWith(componentRoot)) continue
      for (const binding of entry.bindings) {
        if (binding.kind !== 'namespace') continue
        imports.push({ file, source: entry.specifier, local: binding.local })
      }
    }
  }
  return imports
}
