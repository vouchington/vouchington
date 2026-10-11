import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'

import picomatch from 'picomatch'
import { parse as load } from 'yaml'

// Rule: a tracked file that a path-gated job's steps reference must trigger that job.
// Limits: only the first level is followed (files named by a step, action, or reusable workflow);
// imports inside those files are not resolved, since the repo forbids owned AST parsers.
// Modeling assumption: `workflow-action-changes` selects every area (the `area()` shell function
// in ci-detect-changes.yml ORs it into each area output).

type Json = Record<string, unknown>
type Step = {
  id?: string
  uses?: string
  run?: string
  with?: Json
  env?: Json
  'working-directory'?: string
}
type Defaults = { run?: { 'working-directory'?: string } }
type Job = {
  defaults?: Defaults
  if?: string
  needs?: string | string[]
  uses?: string
  steps?: Step[]
  env?: Json
  with?: Json
}
type Gate = { step: string; key: string }
type Doc = {
  env?: Json
  defaults?: Defaults
  jobs?: Record<string, Job>
  runs?: { steps?: Step[] }
}
type DetectDoc = { jobs: Record<string, { outputs: Record<string, string>; steps: Step[] }> }

export type Violation = { area: string; job: string; file: string; via: string }
export type JobReference = Violation & { gates: Gate[] }
export const areas = ['backend', 'web', 'cloudflare-worker', 'lambdas', 'tooling']

const readDoc = (path: string) => load(readFileSync(path, 'utf8')) as Doc
const tracked = new Set(
  execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n'),
)
const filters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as Record<
  string,
  string[]
>
const detectJob = (
  load(readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8')) as DetectDoc
).jobs['detect-changes']
const quantifier: Record<string, 'every' | 'some'> = {}
for (const step of detectJob.steps) {
  if (step.id && step.with?.filters)
    quantifier[step.id] = step.with['predicate-quantifier'] === 'every' ? 'every' : 'some'
}
const areaEnv = detectJob.steps.find(step => step.id === 'areas')?.env as Record<string, string>
// Context outputs, not path gates.
const contextKeys = new Set(['trusted', 'dependency-bot-test', 'docs-only'])

const stepRefs = (expr: string): Gate[] =>
  [...expr.matchAll(/steps\.([\w-]+)\.outputs\.([\w-]+)/g)].map(m => ({ step: m[1], key: m[2] }))

function outputGates(name: string): Gate[] {
  return stepRefs(detectJob.outputs[name] ?? '').flatMap(gate =>
    gate.step === 'areas'
      ? stepRefs(areaEnv[gate.key.toUpperCase().replaceAll('-', '_')] ?? '')
      : quantifier[gate.step]
        ? [gate]
        : [],
  )
}

export function gateMatches(gate: Gate, path: string): boolean {
  const globs = filters[gate.key] ?? []
  const match = (glob: string) => picomatch.isMatch(path, glob, { dot: true })
  return quantifier[gate.step] === 'every'
    ? globs.length > 0 && globs.every(match)
    : globs.some(match)
}

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(strings)
      : []

// Keep fragments in the token: diagnostic links are not prefixes of tracked filenames.
const pathToken =
  /(?<![\w./-])(?:\$GITHUB_WORKSPACE\/|\$\{\{\s*github\.workspace\s*\}\}\/|\.\/)?((?:[\w.-]+\/)*[\w.*#-]+)/g
const trackedFiles = (directory: string, ...values: unknown[]) =>
  strings(values).flatMap(text =>
    [...text.matchAll(pathToken)].flatMap(m => {
      const root = m[0].startsWith('$')
      const file = posix.normalize(root ? m[1] : posix.join(directory, m[1]))
      return tracked.has(file) ? [file] : []
    }),
  )

type Found = Map<string, string>
const chain = (head: string, via: string) => [head, via].filter(Boolean).join(' > ')

export function stepFiles(steps: Step[] | undefined, seen: Set<string>, directory = ''): Found {
  const found: Found = new Map()
  for (const step of steps ?? []) {
    for (const file of trackedFiles(step['working-directory'] ?? directory, step.run, step.env))
      found.set(file, '')
    for (const file of trackedFiles('', step.with)) found.set(file, '')
    const action = step.uses?.startsWith('./.github/actions/')
      ? `${step.uses.slice(2)}/action.yml`
      : ''
    if (!action || seen.has(action) || !existsSync(action)) continue
    seen.add(action)
    for (const [file, via] of stepFiles(readDoc(action).runs?.steps, seen))
      found.set(file, chain(action, via))
  }
  return found
}

// Inner reusable-workflow jobs guarded by `if: inputs.NAME` run only when the caller enables NAME.
function enabledByCaller(inner: Job, caller: Job): boolean {
  const input = /^\s*(?:\$\{\{\s*)?inputs\.([\w-]+)(?:\s*\}\})?\s*$/.exec(inner.if ?? '')?.[1]
  if (!input) return true
  const value = caller.with?.[input]
  return value === true || (typeof value === 'string' && value.includes('${{'))
}

export function jobFiles(job: Job, seen: Set<string>, defaults?: Defaults, env?: Json): Found {
  const directory =
    job.defaults?.run?.['working-directory'] ?? defaults?.run?.['working-directory'] ?? ''
  const steps = job.steps?.map(step => ({ ...step, env: { ...env, ...job.env, ...step.env } }))
  const found = stepFiles(steps, seen, directory)
  for (const file of trackedFiles('', job.with)) found.set(file, '')
  const workflow = job.uses?.startsWith('./.github/workflows/') ? job.uses.slice(2) : ''
  if (!workflow || seen.has(workflow)) return found
  seen.add(workflow)
  const doc = readDoc(workflow)
  const inners = Object.values(doc.jobs ?? {}).filter(
    j =>
      enabledByCaller(j, job) &&
      !(
        !j.if?.includes('||') &&
        /github\.event_name\s*==\s*['"]push['"]/.test(j.if ?? '') &&
        /github\.ref\s*==\s*['"]refs\/heads\/main['"]/.test(j.if ?? '')
      ),
  )
  for (const inner of inners)
    for (const [file, via] of jobFiles(inner, seen, doc.defaults, doc.env))
      found.set(file, chain(workflow, via))
  return found
}

export function jobReferences(): JobReference[] {
  return areas.flatMap(area => {
    const doc = readDoc(`.github/workflows/${area}.yml`)
    const jobs = doc.jobs ?? {}
    const gateCache = new Map<string, Gate[]>()
    const gatesOf = (name: string): Gate[] => {
      const cached = gateCache.get(name)
      if (cached) return cached
      const own = [...(jobs[name].if ?? '').matchAll(/needs\.changes\.outputs\.([\w-]+)/g)].flatMap(
        m => outputGates(m[1]).filter(gate => !contextKeys.has(gate.key)),
      )
      const needs = [jobs[name].needs ?? []].flat().filter(need => need !== 'changes')
      const gates = own.length ? own : needs.flatMap(gatesOf)
      gateCache.set(name, gates)
      return gates
    }
    return Object.entries(jobs).flatMap(([job, def]) => {
      const gates = gatesOf(job)
      if (!gates.length) return []
      return [...jobFiles(def, new Set(), doc.defaults, doc.env)].map(([file, via]) => ({
        area,
        job,
        file,
        via,
        gates,
      }))
    })
  })
}

export function pathGateViolations(): Violation[] {
  const everyArea: Gate = { step: 'filter', key: 'workflow-action-changes' }
  return jobReferences().flatMap(({ gates, ...violation }) =>
    [...gates, everyArea].some(gate => gateMatches(gate, violation.file)) ? [] : [violation],
  )
}

export const formatViolation = ({ area, job, file, via }: Violation) =>
  `${area}.yml#${job}: ${file}${via ? ` (via ${via})` : ''}`
