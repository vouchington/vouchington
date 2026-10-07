import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import picomatch from 'picomatch'
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

  it('selects backend PR validation and main publication when the CI package boundary changes', () => {
    expect(ciBackendFilter()).toContain('ci/package.json')

    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    expect(workflow).toContain("- 'ci/package.json'")
  })

  it('triggers the main backend workflow when the live MCP catalog checker changes', () => {
    const checker = 'ci/check-live-mcp-catalog.mjs'
    expect(ciBackendFilter()).toContain(checker)

    const workflow = load(readFileSync('.github/workflows/main-backend.yml', 'utf8')) as {
      on?: { push?: { paths?: string[] } }
    }
    const pushPaths = workflow.on?.push?.paths ?? []
    expect(pushPaths).toContain(checker)
    expect(pushPaths.some(glob => picomatch.isMatch(checker, glob, { dot: true }))).toBe(true)
  })

  it('contains only image publication selection, intent, and publication jobs', () => {
    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    const parsed = load(workflow) as { jobs?: Record<string, unknown> }

    expect(Object.keys(parsed.jobs ?? {}).toSorted()).toEqual([
      'backend-deploy-intent',
      'detect-image-publication',
      'publish-backend-images',
    ])
    expect(workflow).not.toContain('source_workflow:')
  })

  it('publishes only when the shared publication-intent detector selects backend images', () => {
    const workflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')
    const publish = jobSection(workflow, 'publish-backend-images')

    expect(publish).toContain('needs: [detect-image-publication]')
    expect(publish).toContain("if: needs.detect-image-publication.outputs.publish == 'true'")
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
    // same artifact. The unified publish-backend-images.yml workflow uses the same composite
    // action for pull-request validation, merge-group publication, and main reuse fallback.
    expect(publishJob).toContain('uses: ./.github/workflows/publish-backend-images.yml')
    expect(publishJob).toContain('trusted_secret_context: true')

    // Unchanged: assembling the deployment payload remains the completed-run receiver's job.
    expect(workflow).not.toContain('artifacts_json')
    expect(workflow).not.toContain('worker_io_enabled')
  })
})
