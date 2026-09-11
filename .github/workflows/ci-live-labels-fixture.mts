import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'

type Step = { name?: string; env?: Record<string, string> }
type Job = {
  if?: string
  outputs?: Record<string, string>
  steps?: Step[]
  with?: Record<string, string>
}
type Workflow = { jobs?: Record<string, Job> }

const readyDedupeWorkflow = load(
  readFileSync('.github/workflows/ci-ready-dedupe.yml', 'utf8'),
) as Workflow
export const readyDedupeScript = 'ci/ready-dedupe.sh'
const detectChangesWorkflow = load(
  readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8'),
) as Workflow
const selectVitestWorkflow = load(
  readFileSync('.github/workflows/ci-select-vitest.yml', 'utf8'),
) as Workflow
export const readyJob = readyDedupeWorkflow.jobs?.['ready-dedupe']
export const detectOutputs = detectChangesWorkflow.jobs?.['detect-changes']?.outputs ?? {}
export const selectStep = selectVitestWorkflow.jobs?.['select-ci']?.steps?.find(
  step => step.name === 'Select Vitest tests',
)
