import { setupNodePnpm, type Step } from './workflow-cache-pnpm-parsing.mts'

/** Validate setup action inputs and deadlines in workflow and composite steps. */
export function setupStepViolations(setupSteps: readonly { owner: string; step: Step }[]): {
  violations: string[]
  scriptFree: string[]
} {
  const violations: string[] = []
  const scriptFree: string[] = []
  for (const { owner, step } of setupSteps) {
    for (const input of Object.keys(step.with ?? {}))
      if (!setupNodePnpm(step) || !['deadline-seconds', 'install-scripts'].includes(input))
        violations.push(`${owner}: unexpected setup input ${input}`)
    if (setupNodePnpm(step)) {
      const timeout = step['timeout-minutes']
      const cap = typeof timeout === 'number' ? timeout : undefined
      const rawDeadline = step.with?.['deadline-seconds']
      const deadline = rawDeadline === undefined ? undefined : Number(rawDeadline)
      if (
        cap !== undefined && cap <= 5
          ? !(
              deadline !== undefined &&
              Number.isInteger(deadline) &&
              deadline > 0 &&
              deadline < cap * 60
            )
          : deadline !== undefined
      )
        violations.push(`${owner}: deadline is not below the step cap`)
    }
    if (step.with && 'install-scripts' in step.with && step.with['install-scripts'] !== 'false')
      violations.push(`${owner}: install-scripts must be false`)
    if (step.with?.['install-scripts'] === 'false') scriptFree.push(owner)
  }
  return { violations, scriptFree }
}
