import { expect } from 'vitest'

export type ImageBuildTrivyStep = {
  'continue-on-error'?: boolean
  id?: string
  if?: string
  name?: string
  run?: string
}

// Install Trivy keeps continue-on-error; the guard immediately after it is the
// enforcement point. The guard, OS scan, and SBOM must not continue on error,
// or a finding would not fail the area gate named by `gate`.
const installGuardIf = "${{ !cancelled() && steps.install-trivy.outcome != 'skipped' }}"

function requiredImageBuildStep(
  steps: readonly ImageBuildTrivyStep[],
  name: string,
  gate: 'backend' | 'web',
): ImageBuildTrivyStep {
  const step = steps.find(candidate => candidate.name === name)
  if (!step) throw new Error(`${gate} image build is missing step "${name}"`)
  return step
}

export function assertImageBuildTrivyGate(options: {
  gate: 'backend' | 'web'
  steps: readonly ImageBuildTrivyStep[]
  scanStepName: string
  sbomStepName: string
}): void {
  const { gate, steps, scanStepName, sbomStepName } = options

  const installStep = requiredImageBuildStep(steps, 'Install Trivy', gate)
  expect(installStep['continue-on-error']).toBe(true)
  // The guard's if keys off this id so a skipped install (an earlier unrelated
  // failure) is not treated as a failed install.
  expect(installStep.id).toBe('install-trivy')
  expect(installStep.run).toContain('--retry 3 --retry-all-errors')

  const installGuardStep = requiredImageBuildStep(steps, 'Trivy install guard', gate)
  expect(installGuardStep['continue-on-error']).toBeUndefined()
  expect(installGuardStep.run).toContain('exit 1')
  // Exact expression: `||` instead of `&&` would run the guard when Install
  // Trivy was skipped and re-enable that failure cascade.
  expect(installGuardStep.if).toBe(installGuardIf)

  const scanStep = requiredImageBuildStep(steps, scanStepName, gate)
  expect(scanStep['continue-on-error']).toBeUndefined()
  expect(scanStep.run).toContain('--exit-code "$TRIVY_FINDINGS_EXIT_CODE"')
  expect(scanStep.run).toContain('--severity CRITICAL,HIGH')
  expect(scanStep.run).toContain('--ignore-unfixed')
  expect(scanStep.run).toContain('--pkg-types os')

  const sbomStep = requiredImageBuildStep(steps, sbomStepName, gate)
  expect(sbomStep['continue-on-error']).toBeUndefined()
  // The SBOM runs only after the OS vulnerability gate has passed, so severity
  // filters would truncate the artifact instead of gating the build.
  expect(sbomStep.run).toContain('--exit-code 0')
  expect(sbomStep.run).not.toContain('--severity')
  expect(sbomStep.run).not.toContain('--ignore-unfixed')
  expect(sbomStep.run).not.toContain('--pkg-types')
  expect(sbomStep.run).not.toContain('--ignorefile')
  expect(sbomStep.run).not.toContain('--scanners vuln')

  const uploadStep = requiredImageBuildStep(steps, 'Upload Trivy artifacts', gate)
  expect(uploadStep['continue-on-error']).toBe(true)
}
