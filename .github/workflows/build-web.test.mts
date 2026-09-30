import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { assertImageBuildTrivyGate } from '../test-helpers/image-build-trivy-gate.mts'

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

// The image build, smoke test, and Trivy gate all live in the composite action used by the unified
// validation/publication workflow.
function readBuildWebImagesSteps(): Step[] {
  const action = load(
    readFileSync('.github/actions/build-web-images/action.yml', 'utf8'),
  ) as CompositeAction
  return action.runs?.steps ?? []
}

describe('web image workflow', () => {
  it('uses the canonical runner-aware allocator for its Docker smoke port', () => {
    const steps = readBuildWebImagesSteps()
    const smoke = steps.find(step => step.name === 'Run Docker smoke test')

    expect(smoke?.run).toContain('PORTS=$(python3 ci/allocate-browser-safe-ports.py 2)')
  })

  it('serves Docker smoke copy from the real localization backend', () => {
    const steps = readBuildWebImagesSteps()
    const install = steps.findIndex(step => step.uses === './.github/actions/setup-node-pnpm')
    const smoke = steps.findIndex(step => step.name === 'Run Docker smoke test')
    expect(install).toBeGreaterThan(-1)
    expect(smoke).toBeGreaterThan(install)
    expect(steps[smoke]?.run).toContain('compile-localization-smoke-catalog.mts')
    expect(steps[smoke]?.run).toContain('localization-smoke-backend.mts')
    expect(steps[smoke]?.run).toContain('--add-host=host.docker.internal:host-gateway')
    expect(steps[smoke]?.run).toContain('API_BASE_URL="http://host.docker.internal:$BACKEND_PORT"')
  })

  it('keeps Sentry credentials out of validation builds and makes trusted publication uploads optional', () => {
    const compositeActionSource = readFileSync(
      '.github/actions/build-web-images/action.yml',
      'utf8',
    )
    const ciSource = readFileSync('.github/workflows/web.yml', 'utf8')
    const publishSource = readFileSync('.github/workflows/publish-web-images.yml', 'utf8')
    const mainWebSource = readFileSync('.github/workflows/main-web.yml', 'utf8')

    const validationJob = ciSource
      .split('\n  validate-web-images:')[1]
      ?.split('\n  publish-web-images:')[0]
    expect(validationJob).not.toContain('SENTRY_AUTH_TOKEN')
    expect(ciSource).not.toContain('SENTRY_RELEASE_REQUIRED')
    expect(compositeActionSource).toContain('sentry-source-map-upload:')
    expect(compositeActionSource).toContain(
      "SENTRY_AUTH_TOKEN=${{ inputs.sentry-source-map-upload == 'true' && inputs.sentry-auth-token || '' }}",
    )
    expect(compositeActionSource).toContain(
      "SENTRY_RELEASE=${{ inputs.sentry-source-map-upload == 'true' && (inputs.sentry-release || github.sha) || '' }}",
    )
    expect(compositeActionSource).not.toContain('ARG SENTRY_AUTH_TOKEN')
    expect(compositeActionSource).not.toContain('ENV SENTRY_AUTH_TOKEN')
    expect(publishSource).toContain('SENTRY_AUTH_TOKEN:\n        required: false')
    expect(publishSource).not.toContain('Verify Sentry source-map upload credentials')
    expect(publishSource).toContain('sentry-source-map-upload: ${{')
    expect(publishSource).toContain('sentry-auth-token: ${{')
    expect(publishSource).toContain("github.event_name == 'merge_group'")
    expect(publishSource).toContain("github.ref == 'refs/heads/main'")
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
    const steps = readBuildWebImagesSteps()
    assertImageBuildTrivyGate({
      gate: 'web',
      steps,
      scanStepName: 'Scan OS packages in web image with Trivy',
      sbomStepName: 'Generate web SBOM',
    })
    const scanStep = steps.find(step => step.name === 'Scan OS packages in web image with Trivy')
    // The captured exit code must actually be re-raised, not just logged.
    expect(scanStep?.run).toContain('|| trivy_exit=$?')
    expect(scanStep?.run).toContain('exit "$trivy_exit"')
    const uploadStep = steps.find(step => step.name === 'Upload Trivy artifacts')
    expect(uploadStep?.with?.path).toContain('trivy-web-os-stderr.txt')
  })
})
