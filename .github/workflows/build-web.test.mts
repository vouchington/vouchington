import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  jobs?: Record<
    string,
    {
      if?: string
      needs?: string | string[]
      outputs?: Record<string, string>
      permissions?: Record<string, string>
      'runs-on'?: string | string[]
      steps?: Array<{
        'continue-on-error'?: boolean
        id?: string
        if?: string
        name?: string
        run?: string
        'timeout-minutes'?: number
        uses?: string
        with?: Record<string, string | number>
      }>
      'timeout-minutes'?: number
    }
  >
}

function readBuildWebWorkflow(): Workflow {
  return load(readFileSync('.github/workflows/build-web.yml', 'utf8')) as Workflow
}

describe('build-web workflow', () => {
  it('uses the canonical runner-aware allocator for its Docker smoke port', () => {
    const smoke = readBuildWebWorkflow().jobs?.build?.steps?.find(
      step => step.name === 'Run Docker smoke test',
    )

    expect(smoke?.run).toContain('PORT=$(python3 ci/allocate-browser-safe-ports.py 1)')
    const steps = readBuildWebWorkflow().jobs?.build?.steps ?? []
    const activate = steps.findIndex(step => step.name === 'Activate pnpm via corepack')
    const smokeIndex = steps.findIndex(step => step.name === 'Run Docker smoke test')
    expect(activate).toBeGreaterThan(-1)
    expect(smokeIndex).toBeGreaterThan(activate)
    expect(steps[activate]?.run).toContain('ci/activate-pnpm.sh')
  })

  it('uses a fail-fast Docker build budget', () => {
    const buildJob = readBuildWebWorkflow().jobs?.build
    const stepTimeoutTotal =
      buildJob?.steps?.reduce((total, step) => total + (step['timeout-minutes'] ?? 0), 0) ?? 0

    expect(stepTimeoutTotal).toBeGreaterThan(15)
    expect(
      buildJob?.steps?.find(step => step.name === 'Build Docker image')?.['timeout-minutes'],
    ).toBe(10)
  })

  it('does not give validation builds Sentry credentials or release-management mode', () => {
    const buildWebSource = readFileSync('.github/workflows/build-web.yml', 'utf8')
    const ciSource = readFileSync('.github/workflows/ci.yml', 'utf8')

    expect(buildWebSource).not.toContain('SENTRY_AUTH_TOKEN')
    expect(ciSource).not.toContain('SENTRY_AUTH_TOKEN')
    expect(buildWebSource).not.toContain('SENTRY_RELEASE_REQUIRED')
  })

  it('limits the Trivy gate to OS vulnerabilities and writes a complete findings report', () => {
    const scanStep = readBuildWebWorkflow().jobs?.build?.steps?.find(
      step => step.name === 'Scan OS packages in web image with Trivy',
    )
    const report = 'trivy-web-os-table.txt'

    expect(scanStep?.run).toContain('--pkg-types os')
    expect(scanStep?.run).toContain('--quiet')
    expect(scanStep?.run).toContain('--table-mode detailed')
    expect(scanStep?.run).toContain(`--output ${report}`)
    expect(scanStep?.run).toContain('2> trivy-web-os-stderr.txt')
    expect(scanStep?.run).toContain(`cat ${report}`)
    expect(scanStep?.run).toContain('cat trivy-web-os-stderr.txt >&2')
    expect(scanStep?.run).not.toContain('echo "Scanning')
    expect(scanStep?.run).not.toContain('No CRITICAL/HIGH')
    expect(scanStep?.run).not.toContain('| tee')
    expect(scanStep?.run).not.toContain('head -n 200')
    expect(scanStep?.run).toContain('title=Trivy OS vulnerability findings')
    expect(scanStep?.run).toContain('title=Trivy scanner error')
  })

  it('gates the build on CRITICAL/HIGH fixable Trivy findings', () => {
    // continue-on-error must be gone from every step in the enforcement chain
    // (install guard, scan, SBOM) so a finding actually fails `build`, which is
    // one of the 4 required checks on the Main ruleset. "Install Trivy" itself
    // keeps continue-on-error: true — the install guard step immediately after
    // it is the deliberate enforcement point for install failures.
    const buildJob = readBuildWebWorkflow().jobs?.build

    const installStep = buildJob?.steps?.find(step => step.name === 'Install Trivy')
    expect(installStep?.['continue-on-error']).toBe(true)
    // The install guard's `if:` keys off this id to tell "install ran and
    // failed" apart from "install never ran because an earlier unrelated step
    // already failed the job" — losing the id silently reverts the guard to
    // always running (steps.install-trivy.outcome resolves to '' which is
    // still != 'skipped').
    expect(installStep?.id).toBe('install-trivy')
    // The install guard below now hard-fails a required check on missing trivy,
    // so the release download itself needs retries against transient GitHub
    // Releases blips (matching the retry pattern used for nodejs downloads
    // elsewhere in this repo).
    expect(installStep?.run).toContain('--retry 3 --retry-all-errors')

    const installGuardStep = buildJob?.steps?.find(step => step.name === 'Trivy install guard')
    expect(installGuardStep?.['continue-on-error']).toBeUndefined()
    expect(installGuardStep?.run).toContain('exit 1')
    // Regression guard: an earlier unrelated step failing the job first
    // skips "Install Trivy" rather than running it. `!cancelled()` alone is
    // true in that case too, so the guard used to run anyway and wrongly
    // claim Trivy was never installed. Only skip the guard's own check when
    // the install step was itself skipped; a genuinely failed (not skipped)
    // install must still trip the guard.
    // Assert the exact expression (not toContain) so a boolean-operator
    // regression like `!cancelled() || steps.install-trivy.outcome !=
    // 'skipped'` — which would re-enable the cascade above — fails here too.
    expect(installGuardStep?.if).toBe(
      "${{ !cancelled() && steps.install-trivy.outcome != 'skipped' }}",
    )

    const scanStep = buildJob?.steps?.find(
      step => step.name === 'Scan OS packages in web image with Trivy',
    )
    expect(scanStep?.['continue-on-error']).toBeUndefined()
    expect(scanStep?.run).toContain('--exit-code "$TRIVY_FINDINGS_EXIT_CODE"')
    expect(scanStep?.run).toContain('--severity CRITICAL,HIGH')
    expect(scanStep?.run).toContain('--ignore-unfixed')
    expect(scanStep?.run).toContain('--pkg-types os')
    // The captured exit code must actually be re-raised, not just logged —
    // this was the bug that made the previous "gate" theater.
    expect(scanStep?.run).toContain('|| trivy_exit=$?')
    expect(scanStep?.run).toContain('exit "$trivy_exit"')

    const sbomStep = buildJob?.steps?.find(step => step.name === 'Generate web SBOM')
    expect(sbomStep?.['continue-on-error']).toBeUndefined()
    // The SBOM step only runs once the OS vulnerability gate has already passed
    // (no `if: always()`), so filtering it by severity would only ever truncate
    // the artifact, never gate anything. Keep it a complete, unfiltered inventory.
    expect(sbomStep?.run).toContain('--exit-code 0')
    expect(sbomStep?.run).not.toContain('--severity')
    expect(sbomStep?.run).not.toContain('--ignore-unfixed')
    expect(sbomStep?.run).not.toContain('--pkg-types')
    expect(sbomStep?.run).not.toContain('--ignorefile')
    expect(sbomStep?.run).not.toContain('--scanners vuln')

    const uploadStep = buildJob?.steps?.find(step => step.name === 'Upload Trivy artifacts')
    expect(uploadStep?.['continue-on-error']).toBe(true)
    expect(uploadStep?.with?.path).toContain('trivy-web-os-stderr.txt')
  })
})
