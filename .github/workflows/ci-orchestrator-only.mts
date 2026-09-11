type WorkflowStep = {
  name?: string
  shell?: string
  uses?: string
  run?: string
  with?: { script?: string; filters?: string }
  [key: string]: unknown
}

type WorkflowJob = {
  env?: Record<string, string>
  uses?: string
  steps?: WorkflowStep[]
  [key: string]: unknown
}

export type Workflow = { jobs?: Record<string, WorkflowJob> }

export function orchestratorViolations(workflow: Workflow): string[] {
  const violations: string[] = []

  for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
    if (job.uses) continue

    for (const step of job.steps ?? []) {
      if (step.run) violations.push(`${name}: run is not allowed`)
      if (step.with?.script)
        violations.push(`${name}: embedded github-script source is not allowed`)
      if (step.with?.filters !== undefined)
        violations.push(`${name}: inline filters are not allowed`)
      if (!step.uses) violations.push(`${name}: executable step must use an action`)
    }
  }

  return violations
}
