import { parse } from 'yaml'

import { isAreaGateJob } from './ci-aggregate-jobs.mts'

type Workflow = {
  name?: string
  jobs?: Record<string, { name?: string; steps?: Array<{ uses?: string }> }>
}
const resultGateAction = 'vouchington/vouchington-tooling/.github/actions/ci-required-result-gate@'

export function areaGateViolations(sources: readonly string[]): string[] {
  const workflows: Array<{ workflow: string; gates: string[] }> = []
  for (const source of sources) {
    const { name, jobs } = parse(source) as Workflow
    const gates = Object.entries(jobs ?? {}).flatMap(([id, job]) =>
      job.steps?.some(step => step.uses?.startsWith(resultGateAction)) ? [job.name ?? id] : [],
    )
    if (gates.length > 0) workflows.push({ workflow: name ?? '', gates })
  }
  const errors: string[] = []
  if (workflows.length !== 6) errors.push('Expected six area workflows with required gates')
  for (const { workflow, gates } of workflows) {
    if (gates.length !== 1) errors.push(`${workflow}: expected exactly one required gate`)
    for (const gate of gates) {
      if (!isAreaGateJob(workflow, gate))
        errors.push(`${workflow}: unrecognized required gate ${gate}`)
      if (
        isAreaGateJob(workflow, 'unknown') ||
        isAreaGateJob('unknown', gate) ||
        isAreaGateJob('Main CI (backend)', gate)
      )
        errors.push(`${workflow}: unrelated gate accepted`)
      for (const other of workflows.filter(other => other.workflow !== workflow)) {
        if (isAreaGateJob(other.workflow, gate))
          errors.push(`${other.workflow}: accepts foreign gate ${gate}`)
      }
    }
  }
  return errors
}
