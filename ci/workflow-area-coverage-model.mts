import picomatch from 'picomatch'
import { stringFromUnknown } from '../ts-shared/utils/string-from-unknown.mts'

export type Step = {
  env?: Record<string, unknown>
  id?: string
  if?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}
export type Job = {
  if?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  steps?: Step[]
  uses?: string
  with?: Record<string, unknown>
  'continue-on-error'?: boolean
}
export type Workflow = { jobs?: Record<string, Job> }
export type Upload = { flag: string; pattern: string }
export type Documents = Readonly<Record<string, Workflow>>
export const areaCoverageWorkflow = './.github/workflows/ci-area-coverage.yml'
export const codecovWorkflow = './.github/workflows/ci-upload-codecov.yml'
export const resultGateAction =
  'vouchington/vouchington-tooling/.github/actions/ci-required-result-gate@'
export const needsOf = (job: Job): string[] => [job.needs ?? []].flat()
export const clausesOf = (condition = ''): string[] =>
  condition.split('&&').map(clause => clause.trim())
export const stepsOf = (workflow: Workflow | undefined): Step[] =>
  Object.values(workflow?.jobs ?? {}).flatMap(job => job.steps ?? [])
export const fullLcovUploads = (workflow: Workflow | undefined): Step[] =>
  stepsOf(workflow).filter(step =>
    step.uses?.startsWith('vouchington/vouchington-tooling/.github/actions/upload-full-lcov@'),
  )
export function fullLcovArtifacts(workflow: Workflow | undefined): string[] {
  const names = fullLcovUploads(workflow).map(
    step =>
      `lcov-full-${String(step.with?.suite)}${stringFromUnknown(step.with?.['name-suffix'] ?? '')}`,
  )
  return [...new Set(names)].map(name => name.replace(/\$\{\{[^}]*\}\}/g, '1'))
}
export const patternMatchesOnce = (artifacts: string[], uploads: Upload[]): boolean =>
  artifacts.every(
    artifact => uploads.filter(upload => picomatch.isMatch(artifact, upload.pattern)).length === 1,
  )
export function uploadsOf(job: Job): Upload[] {
  return JSON.parse(String(job.with?.uploads)) as Upload[]
}
export const calledWorkflow = (documents: Documents, job: Job): Workflow | undefined =>
  job.uses?.startsWith('./.github/workflows/') ? documents[job.uses.slice(2)] : undefined
