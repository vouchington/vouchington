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
  'timeout-minutes'?: number | string
  steps?: Array<{
    name?: string
    id?: string
    if?: string
    uses?: string
    with?: Record<string, unknown>
    run?: string
    env?: Record<string, string>
    'continue-on-error'?: boolean
    'timeout-minutes'?: number | string
  }>
}

type Workflow = {
  on?: unknown
  permissions?: Record<string, string>
  jobs?: Record<string, WorkflowJob>
}

export const fixMain = readFileSync('.github/workflows/fix-main.yml', 'utf8')
export const harnessDispatch = readFileSync('.github/workflows/harness-dispatch.yml', 'utf8')
export const fixMainPrompt = readFileSync('docs/prompts/automation/fix-main.md', 'utf8')
export const parsedMain = load(fixMain) as Workflow
export const parsedDispatch = load(harnessDispatch) as Workflow
