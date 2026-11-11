import picomatch from 'picomatch'
import { coverageAreas, type CoverageArea } from '../ci/coverage-area-rules.mts'
import type { VitestJobOwnership } from '../ci/vitest/project-ownership-types.mts'

export interface LocalCoverageRules extends Record<string, unknown> {
  rules: { paths: string; patch_coverage_min: number; area?: string }[]
}

export interface AreaWorkflow {
  jobs: Record<string, { uses?: string; with?: { publish_coverage?: boolean } }>
}

export function impactedCoverageAreas(paths: string[], config: LocalCoverageRules): CoverageArea[] {
  const selected = new Set<CoverageArea>()
  const owners = new Map<string, CoverageArea>(coverageAreas.map(area => [area, area]))
  for (const path of paths) {
    if (path === '.coverage-rules.yml' || path.startsWith('ci/vitest/')) {
      for (const area of coverageAreas) selected.add(area)
    }
    // A changed SQL caller or assertion can affect backend suites even when that file itself
    // has a zero coverage threshold. These suites provide the caller assertions as well.
    if (path.startsWith('backend/')) selected.add('backend')
    const rule = config.rules.find(candidate =>
      picomatch.isMatch(path, candidate.paths, { dot: true }),
    )
    if (rule && rule.patch_coverage_min > 0) {
      const area = owners.get(rule.area ?? '')
      if (!area) throw new Error(`Unknown patch coverage owner for ${path}: ${String(rule.area)}`)
      selected.add(area)
    }
  }
  return [...selected].toSorted()
}

export function localCoverageProjects(
  workflow: AreaWorkflow,
  ownership: readonly VitestJobOwnership[],
) {
  const workflows = new Set<string | undefined>()
  for (const job of Object.values(workflow.jobs)) {
    if (job.with?.publish_coverage === true) workflows.add(job.uses?.split('/').at(-1))
  }
  const scopes = new Map<string, string>()
  for (const job of ownership) {
    if (job.invocation === 'tooling-registry') scopes.set(job.workflow, 'tooling')
    if (job.invocation === 'portability-group') scopes.set(job.workflow, 'portability')
  }
  const projects = ownership.flatMap(job =>
    workflows.has(job.workflow)
      ? job.projects.map(project => ({
          ...project,
          coverageScope:
            job.invocation === 'storybook' ? project.project : scopes.get(job.workflow),
        }))
      : [],
  )
  const credentialed = projects.find(project => project.credential !== 'None')
  if (credentialed) throw new Error(`Coverage producer needs credentials: ${credentialed.project}`)
  if (projects.length === 0) throw new Error('No local Vitest coverage producers found for area')
  const registered = new Set(ownership.map(job => job.workflow))
  const additionalProducers = [...workflows].filter(
    name => name !== undefined && !registered.has(name),
  )
  return { projects, additionalProducers }
}
