import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'

export type WorkflowJob = {
  'runs-on'?: string | string[]
  env?: Record<string, string>
  needs?: string | string[]
  uses?: string
  with?: Record<string, unknown>
  secrets?: string | Record<string, unknown>
  if?: string
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  steps?: Array<{
    name?: string
    id?: string
    if?: string
    uses?: string
    with?: Record<string, unknown>
    run?: string
    env?: Record<string, string>
  }>
}

type Workflow = {
  name?: string
  on?: unknown
  permissions?: Record<string, string>
  concurrency?: { group?: string; queue?: string; 'cancel-in-progress'?: boolean }
  jobs?: Record<string, WorkflowJob>
}

const read = (path: string) => readFileSync(path, 'utf8')

export const workflowText = read('.github/workflows/fix-dependabot.yml')
export const promptText = read('docs/prompts/automation/fix-dependabot.md')
export const parsedDependabot = load(workflowText) as Workflow

const nightly = load(read('.github/workflows/nightly.yml')) as Workflow
export const nightlyAreaWorkflowNames = Object.values(nightly.jobs ?? {}).map(job => {
  const workflowPath = job.uses
  if (!workflowPath) throw new Error('Nightly area jobs must call a reusable workflow')
  const name = (load(read(workflowPath)) as Workflow).name
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`Nightly area workflow ${workflowPath} must have a name`)
  }
  return name
})
