import { globSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import vitestConfig from '../../vitest.config.mts'

import { projectToJob } from './project-ownership-registry.mts'

export const BACKEND_UNIT_SUITE_FLOOR = 2151
export const BACKEND_UNIT_SUITE_CEILING = 4302

type InlineVitestProject = {
  root?: string
  test?: {
    name?: string
    include?: string[]
    exclude?: string[]
    root?: string
  }
}

function isInlineProject(project: unknown): project is InlineVitestProject {
  return typeof project === 'object' && project !== null
}

function projectFileSet(worktreeRoot: string, project: InlineVitestProject): Set<string> {
  const include = project.test?.include ?? []
  const exclude = project.test?.exclude ?? []
  const projectRoot = resolve(worktreeRoot, project.root ?? project.test?.root ?? '.')
  const matches = new Set<string>()
  for (const pattern of include) {
    for (const file of globSync(pattern, { cwd: projectRoot, exclude })) {
      matches.add(relative(worktreeRoot, resolve(projectRoot, file)))
    }
  }
  return matches
}

export function countJobSuiteFiles(worktreeRoot: string): Map<string, number> {
  const mapping = projectToJob()
  const filesByJob = new Map<string, Set<string>>()
  const projects = vitestConfig.test?.projects ?? []
  for (const project of projects) {
    if (!isInlineProject(project)) continue
    const name = project.test?.name
    if (name === undefined || name === '') continue
    const job = mapping[name]
    if (job === undefined) continue
    const jobFiles = filesByJob.get(job) ?? new Set<string>()
    for (const file of projectFileSet(worktreeRoot, project)) jobFiles.add(file)
    filesByJob.set(job, jobFiles)
  }
  return new Map([...filesByJob].map(([job, files]) => [job, files.size]))
}

export function assertBackendUnitSuiteBounds(count: number): void {
  if (count < BACKEND_UNIT_SUITE_FLOOR) {
    throw new Error(
      `test-backend-unit suite count ${count} is below the recorded ${BACKEND_UNIT_SUITE_FLOOR}-file incident floor`,
    )
  }
  if (count > BACKEND_UNIT_SUITE_CEILING) {
    throw new Error(
      `test-backend-unit suite count ${count} exceeds the ${BACKEND_UNIT_SUITE_CEILING} overcount canary`,
    )
  }
}
