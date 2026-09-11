import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const workflowYamlPaths = [
  ...readdirSync('.github/workflows').map(file => join('.github/workflows', file)),
  ...readdirSync('.github/actions', { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return []
    const dir = join('.github/actions', entry.name)
    return readdirSync(dir).flatMap(file => (/^action\.ya?ml$/.test(file) ? [join(dir, file)] : []))
  }),
].filter(path => /\.ya?ml$/.test(path))

export function yamlSource(path: string): string {
  return readFileSync(path, 'utf8')
}

export function actionStepBlocks(source: string, usesPattern: RegExp): string[] {
  const blocks: string[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!usesPattern.test(lines[i]!)) continue
    const inlineStepIndent = lines[i]!.match(/^(\s*)-\s+uses:/)?.[1].length
    const standaloneUsesIndent = lines[i]!.match(/^(\s*)uses:/)?.[1].length
    const stepIndent =
      inlineStepIndent ?? (standaloneUsesIndent != null ? standaloneUsesIndent - 2 : undefined)
    if (stepIndent == null || stepIndent < 0) continue
    const stepStartPattern = new RegExp(`^ {${stepIndent}}- `)
    let start = i
    while (start > 0 && !stepStartPattern.test(lines[start]!)) start--
    let end = i + 1
    while (end < lines.length && !stepStartPattern.test(lines[end]!)) end++
    blocks.push(lines.slice(start, end).join('\n'))
  }
  return blocks
}
