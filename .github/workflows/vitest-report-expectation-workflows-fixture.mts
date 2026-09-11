import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'

type Step = { name?: string; env?: Record<string, string>; run?: string }
type Job = { if?: string; needs?: string[]; outputs?: Record<string, string>; steps?: Step[] }
type Workflow = { jobs?: Record<string, Job> }

const ciWorkflow = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow
const coverageWorkflow = load(
  readFileSync('.github/workflows/ci-test-coverage.yml', 'utf8'),
) as Workflow
export const testsProcessingWorkflow = load(
  readFileSync('.github/workflows/ci-tests-processing.yml', 'utf8'),
) as Workflow

export const coverageJob = coverageWorkflow.jobs?.['test-coverage']
export const expectationStep = coverageJob?.steps?.find(
  step => step.name === 'Resolve expected Vitest reports',
)
export const mergeExpectationStep = testsProcessingWorkflow.jobs?.['tests-processing']?.steps?.find(
  step => step.name === 'Resolve merge Vitest report expectations',
)
export const credentialedGate = ciWorkflow.jobs?.['test-backend-credentialed']?.if ?? ''
export const coverageCaller = ciWorkflow.jobs?.['test-coverage']
