import { globSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import vitestConfig from '../../vitest.config.mts'

import { projectToJob } from './project-ownership-registry.mts'

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

export function countJobSuiteFiles(
  worktreeRoot: string,
  projects: readonly unknown[] = vitestConfig.test?.projects ?? [],
): Map<string, number> {
  const mapping = projectToJob()
  const filesByJob = new Map<string, Set<string>>()
  for (const project of projects) {
    if (!isInlineProject(project)) continue
    const name = project.test?.name
    if (name === undefined || name === '') continue
    const job = mapping[name]
    if (job === undefined) continue
    const projectFiles = projectFileSet(worktreeRoot, project)
    if (projectFiles.size === 0) {
      throw new Error(`Vitest project ${name} owned by ${job} selects no test files`)
    }
    const jobFiles = filesByJob.get(job) ?? new Set<string>()
    for (const file of projectFiles) jobFiles.add(file)
    filesByJob.set(job, jobFiles)
  }
  return new Map([...filesByJob].map(([job, files]) => [job, files.size]))
}
