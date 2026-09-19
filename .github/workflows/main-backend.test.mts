import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

function jobSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

function ciBackendFilter(): string[] {
  const filters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as Record<
    string,
    string[]
  >
  return filters.backend ?? []
}

describe('main-backend workflow', () => {
  it('runs when shared port allocation inputs change', () => {
    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')

    expect(workflow).toContain("- 'ts-shared/**'")
    expect(workflow).toContain("- 'ci/allocate-browser-safe-ports.py'")
  })

  it('runs PR and Main backend tests when the CI package export boundary changes', () => {
    expect(ciBackendFilter()).toContain('ci/package.json')

    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    expect(workflow).toContain("- 'ci/package.json'")
  })

  it('runs the service-free backend workflow without an inline deploy dispatch', () => {
    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')

    expect(jobSection(workflow, 'test-backend-modules')).toContain(
      'uses: ./.github/workflows/tests-backend-modules.yml',
    )
    expect(workflow).not.toContain('source_workflow:')
  })

  it('runs standalone backend smoke in parallel', () => {
    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    const smokeJob = jobSection(workflow, 'backend-smoke')

    expect(smokeJob).toContain('uses: ./.github/workflows/checks-backend-smoke.yml')
  })

  it('gates backend checks on the static-checks workflow', () => {
    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    const staticChecksJob = jobSection(workflow, 'static-checks')

    expect(staticChecksJob).toContain('uses: ./.github/workflows/checks-static.yml')
    expect(staticChecksJob).toContain('backend: true')
  })

  it('leaves source-only deployment metadata to the completed-run receiver', () => {
    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')

    expect(workflow).not.toContain('source_workflow:')
    expect(workflow).not.toContain('main-deploy-eligibility')
    expect(workflow).not.toContain('cleanup-artifacts.yml')
  })

  it('builds and publishes the deployable images without assembling deployment metadata', () => {
    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    const publishJob = jobSection(workflow, 'publish-backend-images')

    // Reversed by vouchington/vouchington-infra#274. This workflow previously built nothing, so
    // the only deployable build happened afterwards in the infrastructure repository and never
    // passed through this repository's smoke tests or scans. It now builds and publishes the
    // images that actually get deployed, making the tested image and the deployed image the
    // same artifact. The build/validate/publish logic lives in publish-backend-images.yml, which
    // shares the build-backend-images composite action with build-backend.yml's PR validation path.
    expect(publishJob).toContain('uses: ./.github/workflows/publish-backend-images.yml')
    expect(publishJob).toContain('trusted_secret_context: true')

    // Unchanged: assembling the deployment payload remains the completed-run receiver's job.
    expect(workflow).not.toContain('artifacts_json')
    expect(workflow).not.toContain('worker_io_enabled')
  })
})
