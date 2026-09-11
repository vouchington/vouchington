import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse as load } from 'yaml'
import picomatch from 'picomatch'

type GlobEntry = string | { 'any-glob-to-any-file': string | string[] }
type LabelerRule = { 'changed-files': GlobEntry[] }
type Labeler = Record<string, LabelerRule[]>
type LabelsFromPathsArgs = { labelerPath: string; paths: string[] }

export function parseLabelsFromPathsArgs(argv: string[], cwd = process.cwd()): LabelsFromPathsArgs {
  const paths: string[] = []
  let labelerPath = resolve(cwd, '.github/labeler.yml')
  let hasExplicitLabeler = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== '--labeler') {
      if (argument.startsWith('--')) throw new Error(`unknown option: ${argument}`)
      paths.push(argument)
      continue
    }

    if (hasExplicitLabeler) throw new Error('--labeler may only be specified once')
    const value = argv[++index]
    if (value === undefined || value.startsWith('--')) throw new Error('--labeler requires a path')
    labelerPath = resolve(cwd, value)
    hasExplicitLabeler = true
  }

  return { labelerPath, paths }
}

export async function labelsFromPaths(paths: string[], labelerPath: string): Promise<string[]> {
  let labeler: Labeler
  try {
    const raw = await readFile(labelerPath, 'utf8')
    const parsed = load(raw)
    if (!parsed || typeof parsed !== 'object') return []
    labeler = parsed as Labeler
  } catch {
    return []
  }
  const matched = new Set<string>()

  for (const [label, rules] of Object.entries(labeler)) {
    if (!Array.isArray(rules)) continue
    let matchedRule = false
    for (const rule of rules) {
      const entries = rule['changed-files']
      if (!entries) continue
      for (const entry of entries) {
        const globs =
          typeof entry === 'string'
            ? [entry]
            : Array.isArray(entry['any-glob-to-any-file'])
              ? entry['any-glob-to-any-file']
              : [entry['any-glob-to-any-file']]
        const isMatch = picomatch(globs)
        for (const p of paths) {
          if (isMatch(p)) {
            matched.add(label)
            matchedRule = true
            break
          }
        }
        if (matchedRule) break
      }
      if (matchedRule) break
    }
  }

  return [...matched]
}

if (process.argv[1] === import.meta.filename) {
  const { labelerPath, paths } = parseLabelsFromPathsArgs(process.argv.slice(2))
  const labels = await labelsFromPaths(paths, labelerPath)
  for (const label of labels) {
    process.stdout.write(`${label}\n`)
  }
}
