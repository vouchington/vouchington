import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as load } from 'yaml'

export type PolicyStep = {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}
type StepHost = {
  jobs?: Record<string, { steps?: PolicyStep[] }>
  runs?: { using?: string; steps?: PolicyStep[] }
}

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

function stepHost(path: string): StepHost {
  return load(yamlSource(path)) as StepHost
}

/** Every workflow job's steps and every composite action's steps, keyed by owner. */
export const stepLists: Array<{ owner: string; steps: PolicyStep[] }> = workflowYamlPaths.flatMap(
  path => {
    const host = stepHost(path)
    if (host.runs)
      return host.runs.using === 'composite' ? [{ owner: path, steps: host.runs.steps ?? [] }] : []
    return Object.entries(host.jobs ?? {}).map(([jobId, job]) => ({
      owner: `${path}#${jobId}`,
      steps: job.steps ?? [],
    }))
  },
)

function localCompositeSteps(uses: string): PolicyStep[] {
  const dir = uses.slice('./'.length)
  const path = ['action.yml', 'action.yaml'].map(file => join(dir, file)).find(existsSync)
  if (!path) throw new Error(`Local action ${uses} has no action.yml`)
  const host = stepHost(path)
  return host.runs?.using === 'composite' ? (host.runs.steps ?? []) : []
}

/**
 * Inlines each local composite action's steps (recursively) right after the step that calls it,
 * so a caller is checked against the steps that actually run.
 */
export function inlineLocalComposites(steps: readonly PolicyStep[]): PolicyStep[] {
  return steps.flatMap(step =>
    step.uses?.startsWith('./.github/actions/')
      ? [step, ...inlineLocalComposites(localCompositeSteps(step.uses))]
      : [step],
  )
}

/**
 * True when a shell body runs `pnpm install` (or `pnpm i`), allowing global options such as
 * `--dir <path>` between them. Comments and `pnpm exec <tool> install` do not count.
 */
export function runsPnpmInstall(body: string | undefined): boolean {
  if (!body) return false
  return body
    .replace(/\\\r?\n\s*/g, ' ')
    .split('\n')
    .some(line =>
      /\bpnpm(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+(?:install|i)\b/.test(line.replace(/#.*$/, '')),
    )
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
