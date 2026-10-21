import { parse } from 'yaml'
import {
  cloudflareWorkerTscStepMarker,
  oxlintTypeAwareStepMarker,
} from './static-analysis-log-fingerprints.mts'
import { buildWebTargetsStepMarker } from './runner-shutdown-consumer-registry.mts'

type YamlStep = { run?: unknown; uses?: unknown }
type YamlWorkflow = { jobs?: Record<string, { steps?: YamlStep[] }>; runs?: { steps?: YamlStep[] } }
// Table A: repo-owned `##[group]Run <run:|uses:>` step-header markers whose source of truth is a
// `run:` or local `uses:` step in this repo's own YAML. sliceGithubActionsStepGroup() slices logs by
// exact substring, so a stale marker never matches and a prefix marker slices the wrong step.
// Headers are grouped per job (GitHub's log boundary); `split('\n')[0]` covers plain, `|`, and `>-`
// run scalars.
export const markerExpectations = [
  {
    marker: cloudflareWorkerTscStepMarker,
    path: '.github/workflows/static-code-analysis.yml',
    jobs: 1,
  },
  {
    marker: oxlintTypeAwareStepMarker,
    path: '.github/workflows/static-code-analysis.yml',
    jobs: 1,
  },
  ...[
    ['checks-static.yml', 1],
    ['tests-playwright.yml', 2],
    ['tests-playwright-credentialed.yml', 1],
    ['tests-web-integration.yml', 2],
  ].map(([file, jobs]) => ({
    marker: buildWebTargetsStepMarker,
    path: `.github/workflows/${file}`,
    jobs: Number(jobs),
  })),
]
export function stepHeaderGroups(source: string): string[][] {
  const parsed = parse(source) as YamlWorkflow
  const jobs = parsed.runs?.steps
    ? [parsed.runs.steps]
    : Object.values(parsed.jobs ?? {}).map(job => job.steps ?? [])
  return jobs.map(steps =>
    steps.flatMap(step => {
      if (typeof step.run === 'string') return [`##[group]Run ${step.run.split('\n')[0]}`]
      if (typeof step.uses === 'string' && step.uses.startsWith('./'))
        return [`##[group]Run ${step.uses}`]
      return []
    }),
  )
}
export function markerHeaderViolations(
  marker: string,
  groups: readonly (readonly string[])[],
  expectedJobs: number,
): string[] {
  const errors: string[] = []
  if (groups.filter(headers => headers.includes(marker)).length !== expectedJobs)
    errors.push(`${marker}: unexpected matching job count`)
  for (const headers of groups) {
    if (headers.filter(header => header === marker).length > 1)
      errors.push(`${marker}: duplicate step header`)
    if (headers.some(header => header !== marker && header.startsWith(marker)))
      errors.push(`${marker}: ambiguous step header prefix`)
  }
  return errors
}
export function externalActionPrefixes(sources: readonly string[]): Set<string> {
  const prefixes = new Set<string>()
  for (const source of sources) {
    const parsed = parse(source) as YamlWorkflow
    const groups = parsed.runs?.steps
      ? [parsed.runs.steps]
      : Object.values(parsed.jobs ?? {}).map(job => job.steps ?? [])
    for (const steps of groups) {
      for (const { uses } of steps) {
        if (typeof uses !== 'string' || uses.startsWith('./')) continue
        const separator = uses.lastIndexOf('@')
        if (separator > 0) prefixes.add(uses.slice(0, separator + 1))
      }
    }
  }
  return prefixes
}
export function uncoveredMarkers(
  sources: ReadonlyMap<string, string>,
  externalPrefixes: ReadonlySet<string>,
): string[] {
  const known = new Set(markerExpectations.map(({ marker }) => marker))
  const errors: string[] = []
  for (const [path, source] of sources) {
    for (const match of source.matchAll(/'(##\[group\]Run [^']*)'/g)) {
      const marker = match[1]
      if (marker === undefined || known.has(marker)) continue
      const action = marker.slice(`##[group]Run `.length)
      if (action.endsWith('@') && externalPrefixes.has(action)) continue
      errors.push(`${path}: ${marker}`)
    }
  }
  return errors
}
