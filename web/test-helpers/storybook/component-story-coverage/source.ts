import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { TypeScriptModuleFacts } from 'no-mistakes'

export interface ComponentExport {
  key: string
  file: string
  exportName: string
  displayName: string
}

export const componentRoot = 'web/components/'
export const storybookRoot = 'web/storybook/'
export const sourceExtensions = ['.tsx', '.ts'] as const
export const repoRoot = findRepoRoot(process.cwd())

function findRepoRoot(cwd: string): string {
  let current = cwd
  while (true) {
    if (
      existsSync(path.join(current, componentRoot)) &&
      existsSync(path.join(current, storybookRoot))
    ) {
      return current
    }
    if (
      path.basename(current) === 'web' &&
      existsSync(path.join(current, 'components')) &&
      existsSync(path.join(current, 'storybook'))
    ) {
      return path.dirname(current)
    }
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`Could not find repository root from ${cwd}`)
    current = parent
  }
}

export function isStoryFile(file: string): boolean {
  return /[.]stories[.](ts|tsx)$/.test(file)
}

export function exportKey(file: string, exportName: string): string {
  return `${file}#${exportName}`
}

export function componentExports(
  files: string[],
  modules: ReadonlyMap<string, TypeScriptModuleFacts>,
  root = repoRoot,
): ComponentExport[] {
  const exports: ComponentExport[] = []
  for (const file of files) {
    if (!file.startsWith(componentRoot) || !file.endsWith('.tsx')) continue
    if (file.includes('/__tests__/') || file.includes('.test.')) continue
    if (!/['"]data-pw['"]|data-pw=/.test(readFileSync(path.join(root, file), 'utf8'))) continue
    const facts = modules.get(file)
    if (!facts?.complete) throw new Error(`Incomplete component module facts: ${file}`)
    for (const item of facts.exports) {
      if (item.specifier || item.typeOnly) continue
      if (item.exported !== 'default' && !/^[A-Z][A-Za-z0-9]*$/.test(item.exported)) continue
      exports.push({
        key: exportKey(file, item.exported),
        file,
        exportName: item.exported,
        displayName: item.exported === 'default' ? item.local || 'default' : item.exported,
      })
    }
  }
  return exports
}
