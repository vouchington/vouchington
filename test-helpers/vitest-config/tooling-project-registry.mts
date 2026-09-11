import {
  isolatedSetupFile,
  toolingProjectPolicies,
  type ToolingProjectName,
  worktreeDbSetupFile,
} from './tooling-project-policies.mts'
import { toolingProjects } from './tooling-projects.mts'

export { toolingProjectPolicies }

type ToolingProjectConfiguration = (typeof toolingProjects)[number]

function projectName(project: ToolingProjectConfiguration): ToolingProjectName {
  const name = project.test?.name
  if (typeof name !== 'string') throw new Error('tooling projects must have string names')
  if (!(name in toolingProjectPolicies)) {
    throw new Error(`tooling project "${name}" is missing required policy metadata`)
  }
  return name as ToolingProjectName
}

function configuredSetupFiles(project: ToolingProjectConfiguration): string[] {
  const setupFiles = project.test?.setupFiles
  if (typeof setupFiles === 'string') return [setupFiles]
  return setupFiles ?? []
}

const setupFileByPolicy = {
  isolated: isolatedSetupFile,
  'worktree-db': worktreeDbSetupFile,
} as const

const configuredToolingProjectNames = toolingProjects.map(project => {
  const name = projectName(project)
  const expectedSetupFile = setupFileByPolicy[toolingProjectPolicies[name].environmentPolicy]
  const setupFiles = configuredSetupFiles(project)
  if (setupFiles.length !== 1 || setupFiles[0] !== expectedSetupFile) {
    throw new Error(`tooling project "${name}" must use setup file "${expectedSetupFile}"`)
  }
  return name
})

const uniqueConfiguredNames = new Set(configuredToolingProjectNames)
if (
  uniqueConfiguredNames.size !== toolingProjects.length ||
  Object.keys(toolingProjectPolicies).some(
    name => !uniqueConfiguredNames.has(name as ToolingProjectName),
  )
) {
  throw new Error(
    'tooling project definitions and policy metadata must form an exact one-to-one set',
  )
}

export const toolingTestProjectNames = configuredToolingProjectNames.filter(
  name => toolingProjectPolicies[name].runInToolingTest,
)

export const toolingWorkflowProjectNames = configuredToolingProjectNames.filter(
  name => toolingProjectPolicies[name].runInToolingWorkflow,
)

export const localCoverageToolingProjectNames = configuredToolingProjectNames.filter(
  name => toolingProjectPolicies[name].runInLocalCoverage,
)

export const dbBackedToolingProjectNames = configuredToolingProjectNames.filter(
  name => toolingProjectPolicies[name].environmentPolicy === 'worktree-db',
)
