import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  'continue-on-error'?: boolean
  id?: string
  if?: string
  name?: string
  run?: string
  uses?: string
  with?: Record<string, string>
}

type CompositeAction = { runs?: { steps?: Step[] } }

// The image build, smoke test, and Trivy gate all live in the composite action that build-web.yml
// (and publish-web-images.yml) delegate to -- only the job-level declarations (env) stay in the
// calling workflow file.
function readBuildWebImagesSteps(): Step[] {
  const action = load(
    readFileSync('.github/actions/build-web-images/action.yml', 'utf8'),
  ) as CompositeAction
  return action.runs?.steps ?? []
}

describe('build-web workflow', () => {
  it('uses the canonical runner-aware allocator for its Docker smoke port', () => {
    const steps = readBuildWebImagesSteps()
    const smoke = steps.find(step => step.name === 'Run Docker smoke test')

    expect(smoke?.run).toContain('PORTS=$(python3 ci/allocate-browser-safe-ports.py 2)')
    const activate = steps.findIndex(step => step.name === 'Activate pnpm via corepack')
    const smokeIndex = steps.findIndex(step => step.name === 'Run Docker smoke test')
    expect(activate).toBeGreaterThan(-1)
    expect(smokeIndex).toBeGreaterThan(activate)
    expect(steps[activate]?.run).toContain('ci/activate-pnpm.sh')
  })

  it('serves Docker smoke copy from the real localization backend', () => {
    const steps = readBuildWebImagesSteps()
    const install = steps.findIndex(step => step.name === 'Install localization smoke dependencies')
    const smoke = steps.findIndex(step => step.name === 'Run Docker smoke test')
    expect(install).toBeGreaterThan(-1)
    expect(smoke).toBeGreaterThan(install)
    expect(steps[install]?.run).toContain('ci/pnpm-install.sh --runner-lifecycle ephemeral-full')
    expect(steps[smoke]?.run).toContain('compile-localization-smoke-catalog.mts')
    expect(steps[smoke]?.run).toContain('localization-smoke-backend.mts')
    expect(steps[smoke]?.run).toContain('--add-host=host.docker.internal:host-gateway')
    expect(steps[smoke]?.run).toContain('API_BASE_URL="http://host.docker.internal:$BACKEND_PORT"')
  })

  it('keeps Sentry credentials out of validation builds and scopes them to trusted publication', () => {
    const buildWebSource = readFileSync('.github/workflows/build-web.yml', 'utf8')
    const compositeActionSource = readFileSync(
      '.github/actions/build-web-images/action.yml',
      'utf8',
    )
    const ciSource = readFileSync('.github/workflows/ci.yml', 'utf8')
    const publishSource = readFileSync('.github/workflows/publish-web-images.yml', 'utf8')
    const mainWebSource = readFileSync('.github/workflows/main-web.yml', 'utf8')

    for (const source of [buildWebSource, ciSource]) {
      expect(source).not.toContain('SENTRY_AUTH_TOKEN')
      expect(source).not.toContain('SENTRY_RELEASE_REQUIRED')
    }
    expect(compositeActionSource).toContain('sentry-source-map-upload:')
    expect(compositeActionSource).toContain(
      "SENTRY_AUTH_TOKEN=${{ inputs.sentry-source-map-upload == 'true' && env.SENTRY_AUTH_TOKEN || '' }}",
    )
    expect(compositeActionSource).toContain(
      "SENTRY_RELEASE=${{ inputs.sentry-source-map-upload == 'true' && (inputs.sentry-release || github.sha) || '' }}",
    )
    expect(compositeActionSource).not.toContain('ARG SENTRY_AUTH_TOKEN')
    expect(compositeActionSource).not.toContain('ENV SENTRY_AUTH_TOKEN')
    expect(publishSource).toContain('SENTRY_AUTH_TOKEN:')
    expect(publishSource).toContain('required: true')
    expect(publishSource).toContain('[ -z "${SENTRY_AUTH_TOKEN:-}" ]')
    expect(publishSource).toContain('exit 1')
    expect(publishSource).toContain("sentry-source-map-upload: 'true'")
    expect(publishSource).toContain('trusted_secret_context')
    expect(mainWebSource).toContain('trusted_secret_context: true')
    expect(mainWebSource).toContain('secrets: inherit')
  })

  it('limits the Trivy gate to OS vulnerabilities and writes a complete findings report', () => {
    const scanStep = readBuildWebImagesSteps().find(
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
    const steps = readBuildWebImagesSteps()

    const installStep = steps.find(step => step.name === 'Install Trivy')
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

    const installGuardStep = steps.find(step => step.name === 'Trivy install guard')
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

    const scanStep = steps.find(step => step.name === 'Scan OS packages in web image with Trivy')
    expect(scanStep?.['continue-on-error']).toBeUndefined()
    expect(scanStep?.run).toContain('--exit-code "$TRIVY_FINDINGS_EXIT_CODE"')
    expect(scanStep?.run).toContain('--severity CRITICAL,HIGH')
    expect(scanStep?.run).toContain('--ignore-unfixed')
    expect(scanStep?.run).toContain('--pkg-types os')
    // The captured exit code must actually be re-raised, not just logged —
    // this was the bug that made the previous "gate" theater.
    expect(scanStep?.run).toContain('|| trivy_exit=$?')
    expect(scanStep?.run).toContain('exit "$trivy_exit"')

    const sbomStep = steps.find(step => step.name === 'Generate web SBOM')
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

    const uploadStep = steps.find(step => step.name === 'Upload Trivy artifacts')
    expect(uploadStep?.['continue-on-error']).toBe(true)
    expect(uploadStep?.with?.path).toContain('trivy-web-os-stderr.txt')
  })
})
