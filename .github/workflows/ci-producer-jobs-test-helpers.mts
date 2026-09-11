export type CiJob = {
  if?: string
  needs?: string[]
  permissions?: Record<string, string>
  uses?: string
  with?: Record<string, string>
}

export type CiWorkflow = { jobs?: Record<string, CiJob> }

const expensiveGate = "skip-expensive-jobs != 'true'"
const settledGate = "skip-settled-producers != 'true'"

export function producerJobNames(workflow: CiWorkflow): string[] {
  return Object.entries(workflow.jobs ?? {})
    .reduce<string[]>((names, [name, job]) => {
      if (
        name !== 'ci-record-state' &&
        (job.if?.includes(expensiveGate) === true || job.if?.includes(settledGate) === true)
      ) {
        names.push(name)
      }
      return names
    }, [])
    .sort()
}

export function recordedProducerNames(job: CiJob | undefined): string[] {
  return Object.keys(JSON.parse(job?.with?.['producer-results'] ?? '{}') as object).sort()
}
