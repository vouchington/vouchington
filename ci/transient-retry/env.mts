import type { WorkflowRunContext } from './types.mts'

export interface DecisionEnv {
  conclusion: WorkflowRunContext['conclusion']
  githubOutput?: string
  repository: string
  runAttempt: number
  runId: string
  workflowName: string
}

const requiredValue = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

export function readDecisionEnv(): DecisionEnv {
  return parseDecisionEnv({
    CONCLUSION: process.env.CONCLUSION,
    GH_TOKEN: process.env.GH_TOKEN,
    GITHUB_OUTPUT: process.env.GITHUB_OUTPUT,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    RUN_ATTEMPT: process.env.RUN_ATTEMPT,
    WORKFLOW_NAME: process.env.WORKFLOW_NAME,
    WORKFLOW_RUN_ID: process.env.WORKFLOW_RUN_ID,
  })
}

export function parseDecisionEnv(env: NodeJS.ProcessEnv): DecisionEnv {
  const {
    CONCLUSION,
    GH_TOKEN,
    GITHUB_OUTPUT,
    GITHUB_REPOSITORY,
    RUN_ATTEMPT,
    WORKFLOW_NAME,
    WORKFLOW_RUN_ID,
  } = env

  // Child gh processes consume this through inherited process.env.
  requiredValue('GH_TOKEN', GH_TOKEN)
  const runAttempt = parseInt(requiredValue('RUN_ATTEMPT', RUN_ATTEMPT), 10)
  if (!Number.isFinite(runAttempt) || runAttempt < 1) {
    throw new Error(`Invalid RUN_ATTEMPT: "${RUN_ATTEMPT}" (expected a positive integer)`)
  }

  return {
    conclusion: requiredValue('CONCLUSION', CONCLUSION) as WorkflowRunContext['conclusion'],
    githubOutput: GITHUB_OUTPUT,
    repository: requiredValue('GITHUB_REPOSITORY', GITHUB_REPOSITORY),
    runAttempt,
    runId: requiredValue('WORKFLOW_RUN_ID', WORKFLOW_RUN_ID),
    workflowName: requiredValue('WORKFLOW_NAME', WORKFLOW_NAME),
  }
}
